import { and, eq, isNull, sql } from 'drizzle-orm'
import { setImmediate } from 'node:timers/promises'
import type { Db, DbExecutor } from '../../../db'
import {
  customIconSetIcons,
  customIconSets,
  iconSearchDocuments,
  iconSearchIndexState,
} from '../../../db/schema'
import { deriveIconSearchDocument, type IconSearchDocument } from './document'
import { lockIconSearchWrites, type IconSearchStateInput } from './index-state'
import { importBatchSize, insertDocumentBatch } from './projection-repository'
import { documentPreference } from './ranking'

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
