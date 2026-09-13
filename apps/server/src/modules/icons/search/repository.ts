import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Db, DbExecutor } from '../../../db'
import {
  customIconSetIcons,
  customIconSets,
  iconSearchDocuments,
  iconSearchIndexState,
} from '../../../db/schema'
import { formatIconCursor, parseIconCursor } from '../../content/icon-sets/cursor'
import { deriveIconSearchDocument, type IconSearchDocument } from './document'
import { IconSearchPreparingError, InvalidIconCursorError } from './errors'
import { deprioritizedIconPrefixes, preferredIconPrefixes } from './config'
import { deriveSearchText, normalizeSearchText } from './text'

export type IconSearchStateInput = {
  indexVersion: string
  iconPackageVersion: string
  searchDataVersion: string
  rulesVersion: string
}

type SearchRow = {
  id: string
  prefix: string
  name: string
  source: 'builtin' | 'custom'
  collection: string
  palette: boolean
  customIconId: string | null
  level: number
  rank: number
  rankText: string
  preference: number
}

const preferredScores = new Map(
  [...preferredIconPrefixes.keys()].map((prefix, index) => [prefix, 100 - index]),
)

function vectorSql(document: IconSearchDocument) {
  const primary = document.primaryEnglishTerms.join(' ')
  const auxiliary = document.auxiliaryEnglishTerms.join(' ')
  return sql`setweight(to_tsvector('simple', ${primary}), 'A') || setweight(to_tsvector('simple', ${auxiliary}), 'B')`
}

async function insertDocumentBatch(executor: DbExecutor, documents: IconSearchDocument[]) {
  if (documents.length === 0) return
  await executor.insert(iconSearchDocuments).values(
    documents.map((document) => ({
      id: document.id,
      prefix: document.prefix,
      name: document.name,
      source: document.source,
      collection: document.collection,
      palette: document.palette,
      customIconId: document.customIconId,
      exactPhrases: document.exactPhrases,
      fullTokens: document.fullTokens,
      searchVector: vectorSql(document),
    })),
  )
}

export async function replaceIconSearchDocuments(
  database: Db,
  documents: IconSearchDocument[],
  state: IconSearchStateInput,
) {
  await database.transaction(async (tx) => {
    await tx.delete(iconSearchDocuments)
    for (let start = 0; start < documents.length; start += 2_000) {
      await insertDocumentBatch(tx, documents.slice(start, start + 2_000))
    }
    await tx.delete(iconSearchIndexState)
    await tx.insert(iconSearchIndexState).values({
      ...state,
      key: 'current',
      documentCount: documents.length,
      completedAt: new Date(),
    })
  })
}

export async function replaceBuiltinIconSearchDocuments(
  database: Db,
  documents: IconSearchDocument[],
  state: IconSearchStateInput,
  rebuildCustom = false,
) {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('icon-search-rebuild'))`)
    await tx.delete(iconSearchDocuments).where(eq(iconSearchDocuments.source, 'builtin'))
    for (let start = 0; start < documents.length; start += 2_000) {
      await insertDocumentBatch(tx, documents.slice(start, start + 2_000))
    }
    if (rebuildCustom) {
      await tx.delete(iconSearchDocuments).where(eq(iconSearchDocuments.source, 'custom'))
      const customRows = await tx
        .select({
          id: customIconSetIcons.id,
          prefix: customIconSets.prefix,
          name: customIconSetIcons.name,
          collection: customIconSets.name,
          palette: customIconSetIcons.palette,
          keywords: customIconSetIcons.keywords,
        })
        .from(customIconSetIcons)
        .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
        .where(and(isNull(customIconSetIcons.deletedAt), isNull(customIconSets.deletedAt)))
      for (const row of customRows) {
        await syncCustomIconSearchDocument(tx, {
          id: `${row.prefix}:${row.name}`,
          prefix: row.prefix,
          name: row.name,
          collection: row.collection,
          palette: row.palette,
          customIconId: row.id,
          keywords: row.keywords,
        })
      }
    }
    const [countRow] = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(iconSearchDocuments)
    await tx.delete(iconSearchIndexState)
    await tx.insert(iconSearchIndexState).values({
      ...state,
      key: 'current',
      documentCount: countRow?.total ?? 0,
      completedAt: new Date(),
    })
  })
}

export async function getCommittedIconSearchState(database: Db) {
  const [state] = await database
    .select()
    .from(iconSearchIndexState)
    .where(eq(iconSearchIndexState.key, 'current'))
    .limit(1)
  return state
}

export async function lockIconSearchWrites(executor: DbExecutor) {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext('icon-search-rebuild'))`)
}

export async function syncCustomIconSearchDocument(
  executor: DbExecutor,
  input: {
    id: string
    prefix: string
    name: string
    collection: string
    palette: boolean
    customIconId: string
    keywords: string[]
  },
) {
  const document = deriveIconSearchDocument({
    ...input,
    source: 'custom',
    primaryPhrases: [input.name, ...input.keywords],
    auxiliaryPhrases: [input.prefix, input.collection],
    exactPhrases: [input.name, ...input.keywords],
  })
  await executor
    .delete(iconSearchDocuments)
    .where(eq(iconSearchDocuments.customIconId, input.customIconId))
  await insertDocumentBatch(executor, [document])
}

export async function deleteCustomIconSearchDocument(executor: DbExecutor, customIconId: string) {
  await executor
    .delete(iconSearchDocuments)
    .where(eq(iconSearchDocuments.customIconId, customIconId))
}

export async function deleteCustomIconSearchDocumentsByPrefix(
  executor: DbExecutor,
  prefix: string,
) {
  await executor
    .delete(iconSearchDocuments)
    .where(and(eq(iconSearchDocuments.source, 'custom'), eq(iconSearchDocuments.prefix, prefix)))
}

function exactId(value: string) {
  const normalized = normalizeSearchText(value)
  const parts = normalized.split(':')
  return parts.length === 2 &&
    parts.every((part) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part) && part.length <= 256)
    ? normalized
    : undefined
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
  const state = await getCommittedIconSearchState(database)
  if (!state) throw new IconSearchPreparingError()

  const normalizedQuery = normalizeSearchText(input.query)
  const parsed = deriveSearchText(normalizedQuery)
  const id = exactId(normalizedQuery)
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
  const tsQueryText = english.map((token) => (token.length >= 2 ? `${token}:*` : token)).join('&')
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
  const preference = sql`CASE prefix
    ${sql.join(
      [...preferredScores].map(([prefix, score]) => sql`WHEN ${prefix} THEN ${score}`),
      sql` `,
    )}
    ${sql.join(
      [...deprioritizedIconPrefixes].map((prefix) => sql`WHEN ${prefix} THEN -1`),
      sql` `,
    )}
    ELSE 0 END`
  const where = [
    input.source ? sql`source = ${input.source}` : undefined,
    input.prefix ? sql`prefix = ${input.prefix}` : undefined,
    id ? sql`id = ${id}` : sql.join(tokenConditions, sql` AND `),
  ].filter((entry): entry is ReturnType<typeof sql> => entry !== undefined)
  const cursorFilter = searchCursor
    ? sql`AND (
    level > ${searchCursor.level} OR
    (level = ${searchCursor.level} AND rank < ${searchCursor.rank}::real) OR
    (level = ${searchCursor.level} AND rank = ${searchCursor.rank}::real AND preference < ${searchCursor.preference}) OR
    (level = ${searchCursor.level} AND rank = ${searchCursor.rank}::real AND preference = ${searchCursor.preference} AND id COLLATE "C" > ${searchCursor.id})
  )`
    : sql``
  const result = await database.execute<SearchRow>(sql`
    WITH scored AS (
      SELECT id, prefix, name, source, collection, palette, custom_icon_id AS "customIconId",
        CASE WHEN exact_phrases @> ARRAY[${normalizedQuery}]::text[] THEN 0
             WHEN full_tokens @> ${queryTokens} THEN 1 ELSE 2 END AS level,
        CASE WHEN ${tsQuery} IS NULL THEN 0::real ELSE ts_rank(search_vector, ${tsQuery}, 0) END AS rank,
        ((${preference}) * 2 + CASE WHEN palette THEN 0 ELSE 1 END)::integer AS preference
      FROM icon_search_documents
      WHERE ${sql.join(where, sql` AND `)}
    ), serialized AS (
      SELECT *, rank::text AS "rankText" FROM scored
    )
    SELECT * FROM serialized WHERE true ${cursorFilter}
    ORDER BY level, rank DESC, preference DESC, id COLLATE "C" ASC
    LIMIT ${input.limit + 1}
  `)
  const resultRows = Array.isArray(result) ? result : result.rows
  const rows = resultRows.slice(0, input.limit)
  const last = rows.at(-1)
  const nextCursor =
    resultRows.length > input.limit && last
      ? formatIconCursor(binding, {
          level: last.level,
          rank: last.rankText,
          preference: last.preference,
          id: last.id,
        })
      : null
  return { rows, nextCursor, indexVersion: state.indexVersion }
}
