import { and, eq } from 'drizzle-orm'
import type { DbExecutor } from '../../db'
import { attachmentReferences } from '../../db/schema'

export type AttachmentReferenceSource = {
  sourceType: string
  sourceId: string
  sourceField: string
}

export async function refreshAttachmentReferences(
  executor: DbExecutor,
  source: AttachmentReferenceSource,
  attachmentIds: string[],
) {
  const uniqueAttachmentIds = [...new Set(attachmentIds)]

  await executor
    .delete(attachmentReferences)
    .where(
      and(
        eq(attachmentReferences.sourceType, source.sourceType),
        eq(attachmentReferences.sourceId, source.sourceId),
        eq(attachmentReferences.sourceField, source.sourceField),
      ),
    )

  if (uniqueAttachmentIds.length === 0) {
    return
  }

  await executor.insert(attachmentReferences).values(
    uniqueAttachmentIds.map((attachmentId) => ({
      attachmentId,
      sourceField: source.sourceField,
      sourceId: source.sourceId,
      sourceType: source.sourceType,
    })),
  )
}

export async function deleteAttachmentReferences(
  executor: DbExecutor,
  source: AttachmentReferenceSource,
) {
  await refreshAttachmentReferences(executor, source, [])
}
