import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { setImmediate } from 'node:timers/promises'
import type { Db, DbExecutor, DbReader } from '../../../db'
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

function documentPreference(document: Pick<IconSearchDocument, 'palette' | 'prefix'>) {
  const prefixScore =
    preferredScores.get(document.prefix) ??
    (deprioritizedIconPrefixes.has(document.prefix) ? -1 : 0)
  return prefixScore * 2 + (document.palette ? 0 : 1)
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
      preference: documentPreference(document),
      customIconId: document.customIconId,
      exactPhrases: document.exactPhrases,
      fullTokens: document.fullTokens,
      searchVector: vectorSql(document),
    })),
  )
}

const importBatchSize = 1_000
const importTable = 'icon_search_documents_staging'

async function stageDocumentBatch(
  executor: DbExecutor,
  tableName: string,
  documents: IconSearchDocument[],
) {
  if (documents.length === 0) return
  const payload = JSON.stringify(
    documents.map((document) => ({
      id: document.id,
      prefix: document.prefix,
      name: document.name,
      source: document.source,
      collection: document.collection,
      palette: document.palette,
      preference: documentPreference(document),
      custom_icon_id: document.customIconId,
      exact_phrases: document.exactPhrases,
      full_tokens: document.fullTokens,
      primary_english_terms: document.primaryEnglishTerms.join(' '),
      auxiliary_english_terms: document.auxiliaryEnglishTerms.join(' '),
    })),
  )
  await executor.execute(sql`
    INSERT INTO ${sql.identifier(tableName)} (
      id, prefix, name, source, collection, palette, preference, custom_icon_id,
      exact_phrases, full_tokens, search_vector
    )
    SELECT document.id, document.prefix, document.name, document.source,
      document.collection, document.palette, document.preference, document.custom_icon_id,
      document.exact_phrases, document.full_tokens,
      setweight(to_tsvector('simple', document.primary_english_terms), 'A') ||
        setweight(to_tsvector('simple', document.auxiliary_english_terms), 'B')
    FROM jsonb_to_recordset(${payload}::jsonb) AS document(
      id text,
      prefix text,
      name text,
      source text,
      collection text,
      palette boolean,
      preference integer,
      custom_icon_id uuid,
      exact_phrases text[],
      full_tokens text[],
      primary_english_terms text,
      auxiliary_english_terms text
    )
  `)
}

async function clearDocumentTable(database: Db, tableName: string) {
  while (true) {
    const result = await database.execute<{ deleted: number }>(sql`
      WITH doomed AS (
        SELECT ctid FROM ${sql.identifier(tableName)} LIMIT ${importBatchSize}
      ), deleted AS (
        DELETE FROM ${sql.identifier(tableName)}
        WHERE ctid IN (SELECT ctid FROM doomed)
        RETURNING 1
      )
      SELECT count(*)::integer AS deleted FROM deleted
    `)
    const rows = Array.isArray(result) ? result : result.rows
    if ((rows[0]?.deleted ?? 0) < importBatchSize) return
    await setImmediate()
  }
}

async function swapDocumentTables(executor: DbExecutor) {
  await executor.execute(
    sql`ALTER TABLE icon_search_documents RENAME TO icon_search_documents_swap`,
  )
  await executor.execute(
    sql`ALTER TABLE icon_search_documents_staging RENAME TO icon_search_documents`,
  )
  await executor.execute(
    sql`ALTER TABLE icon_search_documents_swap RENAME TO icon_search_documents_staging`,
  )

  const constraints = ['pkey', 'source_check', 'custom_id_check']
  for (const name of constraints) {
    await executor.execute(
      sql`ALTER TABLE icon_search_documents_staging RENAME CONSTRAINT ${sql.identifier(`icon_search_documents_${name}`)} TO ${sql.identifier(`icon_search_documents_swap_${name}`)}`,
    )
    await executor.execute(
      sql`ALTER TABLE icon_search_documents RENAME CONSTRAINT ${sql.identifier(`icon_search_documents_staging_${name}`)} TO ${sql.identifier(`icon_search_documents_${name}`)}`,
    )
    await executor.execute(
      sql`ALTER TABLE icon_search_documents_staging RENAME CONSTRAINT ${sql.identifier(`icon_search_documents_swap_${name}`)} TO ${sql.identifier(`icon_search_documents_staging_${name}`)}`,
    )
  }

  const indexes = [
    'full_tokens_gin',
    'exact_phrases_gin',
    'search_vector_gin',
    'source_prefix_id_idx',
    'custom_icon_id_unique',
  ]
  for (const name of indexes) {
    await executor.execute(
      sql`ALTER INDEX ${sql.identifier(`icon_search_documents_${name}`)} RENAME TO ${sql.identifier(`icon_search_documents_swap_${name}`)}`,
    )
    await executor.execute(
      sql`ALTER INDEX ${sql.identifier(`icon_search_documents_staging_${name}`)} RENAME TO ${sql.identifier(`icon_search_documents_${name}`)}`,
    )
    await executor.execute(
      sql`ALTER INDEX ${sql.identifier(`icon_search_documents_swap_${name}`)} RENAME TO ${sql.identifier(`icon_search_documents_staging_${name}`)}`,
    )
  }
}

export async function replaceIconSearchDocuments(
  database: Db,
  documents: IconSearchDocument[],
  state: IconSearchStateInput,
) {
  await database.transaction(async (tx) => {
    await lockIconSearchWrites(tx)
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
  documents: AsyncIterable<IconSearchDocument> | Iterable<IconSearchDocument>,
  state: IconSearchStateInput,
  rebuildCustom = false,
) {
  try {
    await clearDocumentTable(database, importTable)
    let batch: IconSearchDocument[] = []
    for await (const document of documents) {
      batch.push(document)
      if (batch.length < importBatchSize) continue
      await database.transaction(async (tx) => {
        await stageDocumentBatch(tx, importTable, batch)
      })
      batch = []
      await setImmediate()
    }
    await database.transaction(async (tx) => {
      await stageDocumentBatch(tx, importTable, batch)
    })
    await database.transaction(async (tx) => {
      await lockIconSearchWrites(tx)
      if (rebuildCustom) {
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
        const customDocuments = customRows.map((row) =>
          deriveIconSearchDocument({
            id: `${row.prefix}:${row.name}`,
            prefix: row.prefix,
            name: row.name,
            source: 'custom',
            collection: row.collection,
            palette: row.palette,
            customIconId: row.id,
            primaryPhrases: [row.name, ...row.keywords],
            auxiliaryPhrases: [row.prefix, row.collection],
            exactPhrases: [row.name, ...row.keywords],
          }),
        )
        await stageDocumentBatch(tx, importTable, customDocuments)
      } else {
        await tx.execute(sql`
          INSERT INTO ${sql.identifier(importTable)} (
            id, prefix, name, source, collection, palette, preference, custom_icon_id,
            exact_phrases, full_tokens, search_vector
          )
          SELECT id, prefix, name, source, collection, palette, preference, custom_icon_id,
            exact_phrases, full_tokens, search_vector
          FROM icon_search_documents WHERE source = 'custom'
        `)
      }
      const countResult = await tx.execute<{ total: number }>(
        sql`SELECT count(*)::integer AS total FROM ${sql.identifier(importTable)}`,
      )
      const countRows = Array.isArray(countResult) ? countResult : countResult.rows
      await tx.delete(iconSearchIndexState)
      await tx.insert(iconSearchIndexState).values({
        ...state,
        key: 'current',
        documentCount: countRows[0]?.total ?? 0,
        completedAt: new Date(),
      })
      await swapDocumentTables(tx)
    })
  } finally {
    await clearDocumentTable(database, importTable)
  }
}

export async function getCommittedIconSearchState(database: DbReader) {
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

type CustomIconSearchInput = {
  id: string
  prefix: string
  name: string
  collection: string
  palette: boolean
  customIconId: string
  keywords: string[]
}

export async function syncCustomIconSearchDocuments(
  executor: DbExecutor,
  inputs: CustomIconSearchInput[],
) {
  for (let start = 0; start < inputs.length; start += importBatchSize) {
    const batch = inputs.slice(start, start + importBatchSize)
    const documents = batch.map((input) =>
      deriveIconSearchDocument({
        ...input,
        source: 'custom',
        primaryPhrases: [input.name, ...input.keywords],
        auxiliaryPhrases: [input.prefix, input.collection],
        exactPhrases: [input.name, ...input.keywords],
      }),
    )
    await executor.delete(iconSearchDocuments).where(
      inArray(
        iconSearchDocuments.customIconId,
        batch.map((input) => input.customIconId),
      ),
    )
    await insertDocumentBatch(executor, documents)
  }
}

export async function syncCustomIconSearchDocument(
  executor: DbExecutor,
  input: CustomIconSearchInput,
) {
  await syncCustomIconSearchDocuments(executor, [input])
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
                rank < ${searchCursor.rank}::real OR
                (rank = ${searchCursor.rank}::real AND preference < ${searchCursor.preference}) OR
                (rank = ${searchCursor.rank}::real AND preference = ${searchCursor.preference} AND id COLLATE "C" > ${searchCursor.id})
              )`
            : sql``
        const result = await tx.execute<SearchRow>(sql`
          WITH scored AS (
            SELECT ctid AS row_id, id, ${level}::integer AS level,
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
            ORDER BY level, rank DESC, preference DESC, id COLLATE "C" ASC
            LIMIT ${input.limit + 1 - rows.length}
          )
          SELECT document.id, document.prefix, document.name, document.source,
            document.collection, document.palette, document.custom_icon_id AS "customIconId",
            page.level, page.rank, page."rankText", page.preference
          FROM page
          INNER JOIN icon_search_documents AS document ON document.ctid = page.row_id
          ORDER BY page.level, page.rank DESC, page.preference DESC, page.id COLLATE "C" ASC
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
