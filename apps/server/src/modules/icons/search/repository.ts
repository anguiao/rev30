import { sql } from 'drizzle-orm'
import { completeIconIdSchema, type IconSearchQuery } from '@rev30/contracts'
import type { Db, DbExecutor } from '../../../db'
import { formatIconSearchCursor, parseIconSearchCursor, type SearchCursorPosition } from '../cursor'
import { IconSearchPreparingError } from '../errors'
import type { IconSearchMetadata } from './document'
import { getCommittedIconSearchState } from './indexing/state'
import { deriveSearchText } from './text'
import { findExpressionSearchRows } from './expression-repository'

type SearchRow = Omit<IconSearchMetadata, 'source'> & SearchCursorPosition

type SearchOptions = IconSearchQuery & {
  source?: IconSearchMetadata['source']
  prefix?: string
  cursor?: string
}

async function findSearchRows(
  executor: DbExecutor,
  options: SearchOptions,
  cursor?: SearchCursorPosition,
): Promise<SearchRow[]> {
  const { phrase, tokens, englishTerms } = deriveSearchText(options.keyword)
  if (tokens.length === 0) return []

  const chinese = tokens.filter((token) => /\p{Script=Han}/u.test(token))
  const primaryMatches = chinese.length
    ? sql.join(
        chinese.map((token) => sql`(primary_tokens @> ARRAY[${token}]::text[])::integer`),
        sql` + `,
      )
    : sql`0`
  const tsQueryText = englishTerms
    .map((token) => (token.length >= 2 ? `${token}:*` : token))
    .join('&')
  const tsQuery =
    englishTerms.length > 0 ? sql`to_tsquery('simple', ${tsQueryText})` : sql`NULL::tsquery`
  const tokenConditions = tokens.map((token) =>
    /^[a-z]+$/.test(token)
      ? sql`search_vector @@ to_tsquery('simple', ${token.length >= 2 ? `${token}:*` : token})`
      : sql`full_tokens @> ARRAY[${token}]::text[]`,
  )
  const queryTokens = sql`ARRAY[${sql.join(
    tokens.map((token) => sql`${token}`),
    sql`, `,
  )}]::text[]`
  const filters = [
    options.source ? sql`source = ${options.source}` : undefined,
    options.prefix ? sql`prefix = ${options.prefix}` : undefined,
  ].filter((entry): entry is ReturnType<typeof sql> => entry !== undefined)
  if (!completeIconIdSchema.safeParse(phrase).success) {
    const expressionRows = await findExpressionSearchRows(
      executor,
      options.keyword,
      filters.length ? sql.join(filters, sql` AND `) : sql`true`,
      options.limit,
      cursor,
    )
    if (expressionRows) return expressionRows
  }
  const conditions = completeIconIdSchema.safeParse(phrase).success
    ? [sql`id = ${phrase}`]
    : [
        sql`exact_phrases @> ARRAY[${phrase}]::text[]`,
        sql`full_tokens @> ${queryTokens} AND NOT exact_phrases @> ARRAY[${phrase}]::text[]`,
        sql`${sql.join(tokenConditions, sql` AND `)} AND NOT full_tokens @> ${queryTokens}`,
      ]
  const rows: SearchRow[] = []

  for (const [level, condition] of conditions.entries()) {
    if (cursor && level < cursor.level) continue
    const cursorFilter =
      cursor && level === cursor.level
        ? sql`AND (
            primary_matches < ${cursor.primaryMatches} OR
            (primary_matches = ${cursor.primaryMatches} AND (
              rank < ${cursor.rank}::real OR
              (rank = ${cursor.rank}::real AND preference < ${cursor.preference}) OR
              (rank = ${cursor.rank}::real AND preference = ${cursor.preference} AND id COLLATE "C" > ${cursor.id})
            ))
          )`
        : sql``
    const result = await executor.execute<SearchRow>(sql`
      WITH scored AS (
        SELECT ctid AS row_id, id, ${level}::integer AS level,
          (${primaryMatches}) AS primary_matches,
          CASE WHEN ${tsQuery} IS NULL THEN 0::real
            ELSE ts_rank(search_vector, ${tsQuery}, 0) END AS rank,
          preference
        FROM icon_search_documents
        WHERE ${filters.length > 0 ? sql.join(filters, sql` AND `) : sql`true`}
          AND ${condition}
      ), page AS (
        SELECT * FROM scored WHERE true ${cursorFilter}
        ORDER BY level, primary_matches DESC, rank DESC, preference DESC, id COLLATE "C" ASC
        LIMIT ${options.limit + 1 - rows.length}
      )
      SELECT document.id, document.prefix, document.name,
        document.collection, document.palette, document.custom_icon_id AS "customIconId",
        page.level, page.primary_matches AS "primaryMatches", page.rank::text AS rank, page.preference
      FROM page
      INNER JOIN icon_search_documents AS document ON document.ctid = page.row_id
      ORDER BY page.level, page.primary_matches DESC, page.rank DESC, page.preference DESC, page.id COLLATE "C" ASC
    `)
    rows.push(...(Array.isArray(result) ? result : result.rows))
    if (rows.length > options.limit) break
  }

  return rows
}

export async function searchIconDocuments(database: Db, options: SearchOptions) {
  const { rows, cursorOptions } = await database.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtext('icon-search-rebuild'))`)
      const state = await getCommittedIconSearchState(tx)
      if (!state) throw new IconSearchPreparingError()

      const cursorOptions = {
        query: options.keyword,
        source: options.source ?? ('all' as const),
        ...(options.prefix ? { prefix: options.prefix } : {}),
        dataVersion: state.indexVersion,
      }
      const cursor = parseIconSearchCursor(options.cursor, cursorOptions)
      const rows = await findSearchRows(tx, options, cursor)
      return { rows, cursorOptions }
    },
    { accessMode: 'read only', isolationLevel: 'read committed' },
  )

  const pageRows = rows.slice(0, options.limit)
  const last = pageRows.at(-1)
  const nextCursor =
    rows.length > options.limit && last
      ? formatIconSearchCursor(cursorOptions, {
          level: last.level,
          primaryMatches: last.primaryMatches,
          rank: last.rank,
          preference: last.preference,
          id: last.id,
        })
      : null
  return { rows: pageRows, nextCursor, indexVersion: cursorOptions.dataVersion }
}
