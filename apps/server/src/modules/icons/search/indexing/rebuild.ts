import { and, eq, getTableName, isNull, sql } from 'drizzle-orm'
import { setImmediate } from 'node:timers/promises'
import type { Db, DbExecutor } from '../../../../db'
import {
  customIconSetIcons,
  customIconSets,
  iconSearchDocuments,
  iconSearchDocumentsStaging,
  iconSearchIndexState,
} from '../../../../db/schema'
import { deriveCustomIconSearchFacts, type IconSearchFacts } from '../facts'
import { lockIconSearchWrites, type IconSearchStateInput } from './state'
import { iconSearchDocumentColumns, insertDocumentBatch } from './sync'

const importTable = getTableName(iconSearchDocumentsStaging)
const importBatchSize = 1_000
const ginIndexes = [
  'exact_keys_gin',
  'tokens_gin',
  'primary_tokens_gin',
  'related_tokens_gin',
  'search_vector_gin',
]

async function stageBuiltinDocuments(
  database: Db,
  documents: AsyncIterable<IconSearchFacts> | Iterable<IconSearchFacts>,
) {
  let batch: IconSearchFacts[] = []
  for await (const document of documents) {
    batch.push(document)
    if (batch.length < importBatchSize) continue
    await database.transaction(async (tx) => {
      await insertDocumentBatch(tx, batch, iconSearchDocumentsStaging)
    })
    batch = []
    await setImmediate()
  }
  await database.transaction(async (tx) => {
    await insertDocumentBatch(tx, batch, iconSearchDocumentsStaging)
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
    await insertDocumentBatch(
      executor,
      customRows.map(deriveCustomIconSearchFacts),
      iconSearchDocumentsStaging,
    )
  } else {
    await executor.execute(sql`
      INSERT INTO ${iconSearchDocumentsStaging} (${iconSearchDocumentColumns})
      SELECT ${iconSearchDocumentColumns} FROM ${iconSearchDocuments} WHERE source = 'custom'
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

  const constraints = ['pkey', 'source_check', 'custom_id_check', 'category_check']
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

  const indexes = [...ginIndexes, 'name_idx', 'source_prefix_id_idx', 'custom_icon_id_unique']
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

async function cleanPendingIndexes(executor: DbExecutor) {
  // Complete bulk GIN work before searches can scan the pending lists.
  for (const name of ginIndexes) {
    await executor.execute(
      sql`SELECT gin_clean_pending_list(${`${importTable}_${name}`}::regclass)`,
    )
  }
}

export async function replaceBuiltinIconSearchDocuments(
  database: Db,
  documents: AsyncIterable<IconSearchFacts> | Iterable<IconSearchFacts>,
  { indexVersion, iconPackageVersion, indexRulesVersion }: IconSearchStateInput,
  options: {
    rebuildCustom: boolean
    onCleanupError?: ((error: Error) => void) | undefined
  },
) {
  await clearStagingDocuments(database)
  try {
    await stageBuiltinDocuments(database, documents)
    await cleanPendingIndexes(database)
    await database.transaction(async (tx) => {
      await lockIconSearchWrites(tx)
      await stageCustomDocuments(tx, options.rebuildCustom)
      await cleanPendingIndexes(tx)
      await tx.execute(sql`ANALYZE ${sql.identifier(importTable)}`)
      const countResult = await tx.execute<{ total: number }>(
        sql`SELECT count(*)::integer AS total FROM ${sql.identifier(importTable)}`,
      )
      const countRows = Array.isArray(countResult) ? countResult : countResult.rows
      await tx.delete(iconSearchIndexState)
      await tx.insert(iconSearchIndexState).values({
        indexVersion,
        iconPackageVersion,
        indexRulesVersion,
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
