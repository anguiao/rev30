import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DbExecutor } from '../../../db'
import { iconSearchDocuments } from '../../../db/schema'
import { deriveIconSearchDocument, type IconSearchDocument } from './document'
import { documentPreference } from './ranking'

export const importBatchSize = 1_000

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
      preference: documentPreference(document),
      customIconId: document.customIconId,
      exactPhrases: document.exactPhrases,
      fullTokens: document.fullTokens,
      searchVector: vectorSql(document),
    })),
  )
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
