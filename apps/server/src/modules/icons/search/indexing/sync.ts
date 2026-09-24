import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DbExecutor } from '../../../../db'
import { iconSearchDocuments } from '../../../../db/schema'
import {
  deriveCustomIconSearchDocument,
  type CustomIconSearchInput,
  type IconSearchDocument,
} from '../document'
import { getIconPreference } from '../rules'

const batchSize = 1_000

function vectorSql(document: IconSearchDocument) {
  const primary = document.primaryEnglishTerms.join(' ')
  const auxiliary = document.auxiliaryEnglishTerms.join(' ')
  return sql`setweight(to_tsvector('simple', ${primary}), 'A') || setweight(to_tsvector('simple', ${auxiliary}), 'B')`
}

export async function insertDocumentBatch(executor: DbExecutor, documents: IconSearchDocument[]) {
  if (documents.length === 0) return
  await executor.insert(iconSearchDocuments).values(
    documents.map((document) => ({
      id: document.id,
      prefix: document.prefix,
      name: document.name,
      source: document.source,
      collection: document.collection,
      palette: document.palette,
      preference: getIconPreference(document),
      customIconId: document.customIconId,
      exactPhrases: document.exactPhrases,
      fullTokens: document.fullTokens,
      primaryTokens: document.primaryTokens,
      searchVector: vectorSql(document),
    })),
  )
}

export async function syncCustomIconSearchDocuments(
  executor: DbExecutor,
  inputs: CustomIconSearchInput[],
) {
  for (let start = 0; start < inputs.length; start += batchSize) {
    const batch = inputs.slice(start, start + batchSize)
    const documents = batch.map(deriveCustomIconSearchDocument)
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
