import { and, eq, inArray } from 'drizzle-orm'
import type { DbExecutor } from '../../../../db'
import { iconSearchDocuments } from '../../../../db/schema'
import { deriveCustomIconSearchFacts, type CustomIconSearchInput } from '../facts'
import { insertDocumentBatch } from './documents'

const batchSize = 1_000

export async function syncCustomIconSearchDocuments(
  executor: DbExecutor,
  inputs: CustomIconSearchInput[],
) {
  for (let start = 0; start < inputs.length; start += batchSize) {
    const batch = inputs.slice(start, start + batchSize)
    const documents = batch.map(deriveCustomIconSearchFacts)
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
