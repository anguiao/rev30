import { and, eq, isNull, sql } from 'drizzle-orm'
import { setImmediate } from 'node:timers/promises'
import type { Db, DbExecutor } from '../../../../db'
import { customIconSetIcons, customIconSets, iconSearchIndexState } from '../../../../db/schema'
import { deriveCustomIconSearchDocument, type IconSearchDocument } from '../document'
import { lockIconSearchWrites, type IconSearchStateInput } from './state'
import { getIconPreference } from '../rules'

const importTable = 'icon_search_documents_staging'
const importBatchSize = 1_000

async function stageDocumentBatch(executor: DbExecutor, documents: IconSearchDocument[]) {
  if (documents.length === 0) return
  const payload = JSON.stringify(
    documents.map((document) => ({
      id: document.id,
      prefix: document.prefix,
      name: document.name,
      source: document.source,
      collection: document.collection,
      palette: document.palette,
      preference: getIconPreference(document),
      custom_icon_id: document.customIconId,
      exact_phrases: document.exactPhrases,
      full_tokens: document.fullTokens,
      primary_tokens: document.primaryTokens,
      primary_english_terms: document.primaryEnglishTerms.join(' '),
      auxiliary_english_terms: document.auxiliaryEnglishTerms.join(' '),
    })),
  )
  await executor.execute(sql`
    INSERT INTO ${sql.identifier(importTable)} (
      id, prefix, name, source, collection, palette, preference, custom_icon_id,
      exact_phrases, full_tokens, primary_tokens, search_vector
    )
    SELECT document.id, document.prefix, document.name, document.source,
      document.collection, document.palette, document.preference, document.custom_icon_id,
      document.exact_phrases, document.full_tokens, document.primary_tokens,
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
      primary_tokens text[],
      primary_english_terms text,
      auxiliary_english_terms text
    )
  `)
}

async function stageBuiltinDocuments(
  database: Db,
  documents: AsyncIterable<IconSearchDocument> | Iterable<IconSearchDocument>,
) {
  let batch: IconSearchDocument[] = []
  for await (const document of documents) {
    batch.push(document)
    if (batch.length < importBatchSize) continue
    await database.transaction(async (tx) => {
      await stageDocumentBatch(tx, batch)
    })
    batch = []
    await setImmediate()
  }
  await database.transaction(async (tx) => {
    await stageDocumentBatch(tx, batch)
  })
}

async function stageCustomDocuments(executor: DbExecutor, rebuildCustom: boolean) {
  if (rebuildCustom) {
    const customRows = await executor
      .select({
        customIconId: customIconSetIcons.id,
        prefix: customIconSets.prefix,
        name: customIconSetIcons.name,
        collection: customIconSets.name,
        palette: customIconSetIcons.palette,
        keywords: customIconSetIcons.keywords,
      })
      .from(customIconSetIcons)
      .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
      .where(and(isNull(customIconSetIcons.deletedAt), isNull(customIconSets.deletedAt)))
    await stageDocumentBatch(executor, customRows.map(deriveCustomIconSearchDocument))
  } else {
    await executor.execute(sql`
      INSERT INTO ${sql.identifier(importTable)} (
        id, prefix, name, source, collection, palette, preference, custom_icon_id,
        exact_phrases, full_tokens, primary_tokens, search_vector
      )
      SELECT id, prefix, name, source, collection, palette, preference, custom_icon_id,
        exact_phrases, full_tokens, primary_tokens, search_vector
      FROM icon_search_documents WHERE source = 'custom'
    `)
  }
}

async function clearStagingDocuments(database: Db) {
  while (true) {
    const result = await database.execute<{ deleted: number }>(sql`
      WITH doomed AS (
        SELECT ctid FROM ${sql.identifier(importTable)} LIMIT ${importBatchSize}
      ), deleted AS (
        DELETE FROM ${sql.identifier(importTable)}
        WHERE ctid IN (SELECT ctid FROM doomed)
        RETURNING 1
      )
      SELECT count(*)::integer AS deleted FROM deleted
    `)
    const rows = Array.isArray(result) ? result : result.rows
    if (rows[0]!.deleted < importBatchSize) return
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

export async function replaceBuiltinIconSearchDocuments(
  database: Db,
  documents: AsyncIterable<IconSearchDocument> | Iterable<IconSearchDocument>,
  state: IconSearchStateInput,
  options: {
    rebuildCustom: boolean
    onCleanupError?: ((error: Error) => void) | undefined
  },
) {
  await clearStagingDocuments(database)
  try {
    await stageBuiltinDocuments(database, documents)
    await database.transaction(async (tx) => {
      await lockIconSearchWrites(tx)
      await stageCustomDocuments(tx, options.rebuildCustom)
      const countResult = await tx.execute<{ total: number }>(
        sql`SELECT count(*)::integer AS total FROM ${sql.identifier(importTable)}`,
      )
      const countRows = Array.isArray(countResult) ? countResult : countResult.rows
      await tx.delete(iconSearchIndexState)
      await tx.insert(iconSearchIndexState).values({
        ...state,
        key: 'current',
        documentCount: countRows[0]!.total,
        completedAt: new Date(),
      })
      await swapDocumentTables(tx)
    })
  } finally {
    await clearStagingDocuments(database).catch((error: unknown) => {
      options.onCleanupError?.(error instanceof Error ? error : new Error(String(error)))
    })
  }
}
