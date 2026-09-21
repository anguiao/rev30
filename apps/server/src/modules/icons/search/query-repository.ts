import { sql } from 'drizzle-orm'
import { completeIconIdSchema } from '@rev30/contracts'
import type { Db } from '../../../db'
import { formatIconCursor, parseIconCursor } from '../cursor'
import { IconSearchPreparingError, InvalidIconCursorError } from './errors'
import { getCommittedIconSearchState } from './index-state'
import { deriveSearchText, normalizeSearchText } from './text'

type SearchRow = {
  id: string
  prefix: string
  name: string
  source: 'builtin' | 'custom'
  collection: string
  palette: boolean
  customIconId: string | null
  level: number
  primaryMatches: number
  rank: number
  rankText: string
  preference: number
}

function exactId(value: string) {
  return completeIconIdSchema.safeParse(value).success ? value : undefined
}

export async function searchIconDocuments(
  database: Db,
  input: {
    query: string
    source?: 'builtin' | 'custom'
    prefix?: string
    limit: number
    cursor?: string
  },
) {
  const normalizedQuery = normalizeSearchText(input.query)
  const parsed = deriveSearchText(normalizedQuery)
  const id = exactId(normalizedQuery)
  return database.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtext('icon-search-rebuild'))`)
      const state = await getCommittedIconSearchState(tx)
      if (!state) throw new IconSearchPreparingError()

      const binding = {
        mode: 'search' as const,
        query: normalizedQuery,
        source: input.source ?? ('all' as const),
        ...(input.prefix ? { prefix: input.prefix } : {}),
        dataVersion: state.indexVersion,
      }
      const cursor = parseIconCursor(input.cursor, binding)
      if (cursor && !('level' in cursor)) throw new InvalidIconCursorError()
      const searchCursor = cursor && 'level' in cursor ? cursor : undefined
      if (!id && parsed.tokens.length === 0)
        return { rows: [] as SearchRow[], nextCursor: null, indexVersion: state.indexVersion }

      const english = parsed.tokens.filter((token) => /^[a-z]+$/.test(token))
      const chinese = parsed.tokens.filter((token) => /\p{Script=Han}/u.test(token))
      const primaryMatches = chinese.length
        ? sql.join(
            chinese.map((token) => sql`(primary_tokens @> ARRAY[${token}]::text[])::integer`),
            sql` + `,
          )
        : sql`0`
      const tsQueryText = english
        .map((token) => (token.length >= 2 ? `${token}:*` : token))
        .join('&')
      const tsQuery =
        english.length > 0 ? sql`to_tsquery('simple', ${tsQueryText})` : sql`NULL::tsquery`
      const tokenConditions = parsed.tokens.map((token) =>
        /^[a-z]+$/.test(token)
          ? sql`search_vector @@ to_tsquery('simple', ${token.length >= 2 ? `${token}:*` : token})`
          : sql`full_tokens @> ARRAY[${token}]::text[]`,
      )
      const queryTokens = sql`ARRAY[${sql.join(
        parsed.tokens.map((token) => sql`${token}`),
        sql`, `,
      )}]::text[]`
      const filters = [
        input.source ? sql`source = ${input.source}` : undefined,
        input.prefix ? sql`prefix = ${input.prefix}` : undefined,
      ].filter((entry): entry is ReturnType<typeof sql> => entry !== undefined)
      const rows: SearchRow[] = []
      const levels = id ? [0] : [0, 1, 2]

      for (const level of levels) {
        if (searchCursor && level < searchCursor.level) continue
        const tierCondition = id
          ? sql`id = ${id}`
          : level === 0
            ? sql`exact_phrases @> ARRAY[${normalizedQuery}]::text[]`
            : level === 1
              ? sql`full_tokens @> ${queryTokens} AND NOT exact_phrases @> ARRAY[${normalizedQuery}]::text[]`
              : sql`${sql.join(tokenConditions, sql` AND `)} AND NOT full_tokens @> ${queryTokens}`
        const cursorFilter =
          searchCursor && level === searchCursor.level
            ? sql`AND (
                primary_matches < ${searchCursor.primaryMatches} OR
                (primary_matches = ${searchCursor.primaryMatches} AND (
                  rank < ${searchCursor.rank}::real OR
                  (rank = ${searchCursor.rank}::real AND preference < ${searchCursor.preference}) OR
                  (rank = ${searchCursor.rank}::real AND preference = ${searchCursor.preference} AND id COLLATE "C" > ${searchCursor.id})
                ))
              )`
            : sql``
        const result = await tx.execute<SearchRow>(sql`
          WITH scored AS (
            SELECT ctid AS row_id, id, ${level}::integer AS level,
              (${primaryMatches}) AS primary_matches,
              CASE WHEN ${tsQuery} IS NULL THEN 0::real
                ELSE ts_rank(search_vector, ${tsQuery}, 0) END AS rank,
              preference
            FROM icon_search_documents
            WHERE ${filters.length > 0 ? sql.join(filters, sql` AND `) : sql`true`}
              AND ${tierCondition}
          ), serialized AS (
            SELECT *, rank::text AS "rankText" FROM scored
          ), page AS (
            SELECT * FROM serialized WHERE true ${cursorFilter}
            ORDER BY level, primary_matches DESC, rank DESC, preference DESC, id COLLATE "C" ASC
            LIMIT ${input.limit + 1 - rows.length}
          )
          SELECT document.id, document.prefix, document.name, document.source,
            document.collection, document.palette, document.custom_icon_id AS "customIconId",
            page.level, page.primary_matches AS "primaryMatches", page.rank, page."rankText", page.preference
          FROM page
          INNER JOIN icon_search_documents AS document ON document.ctid = page.row_id
          ORDER BY page.level, page.primary_matches DESC, page.rank DESC, page.preference DESC, page.id COLLATE "C" ASC
        `)
        rows.push(...(Array.isArray(result) ? result : result.rows))
        if (rows.length > input.limit) break
      }

      const resultRows = rows
      const pageRows = resultRows.slice(0, input.limit)
      const last = pageRows.at(-1)
      const nextCursor =
        resultRows.length > input.limit && last
          ? formatIconCursor(binding, {
              level: last.level,
              primaryMatches: last.primaryMatches,
              rank: last.rankText,
              preference: last.preference,
              id: last.id,
            })
          : null
      return { rows: pageRows, nextCursor, indexVersion: state.indexVersion }
    },
    { accessMode: 'read only', isolationLevel: 'read committed' },
  )
}
