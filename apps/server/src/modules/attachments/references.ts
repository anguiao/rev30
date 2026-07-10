import { and, eq, isNull } from 'drizzle-orm'
import type { DbExecutor, DbReader } from '../../db'
import { attachmentReferences, attachments } from '../../db/schema'
import { AttachmentReferenceTargetInvalidError } from './errors'

export type AttachmentReferenceSource = {
  sourceType: string
  sourceId: string
  sourceField: string
}

function sourceReferenceCondition(source: AttachmentReferenceSource) {
  return and(
    eq(attachmentReferences.sourceType, source.sourceType),
    eq(attachmentReferences.sourceId, source.sourceId),
    eq(attachmentReferences.sourceField, source.sourceField),
  )
}

export async function lockActiveAttachmentsByIds(executor: DbReader, attachmentIds: string[]) {
  const rows: Array<typeof attachments.$inferSelect> = []

  for (const attachmentId of [...new Set(attachmentIds)].sort()) {
    const [row] = await executor
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, attachmentId), isNull(attachments.deletedAt)))
      .limit(1)
      .for('update')

    if (row) {
      rows.push(row)
    }
  }

  return rows
}

export async function refreshAttachmentReferences(
  executor: DbExecutor,
  source: AttachmentReferenceSource,
  attachmentIds: string[],
) {
  const uniqueAttachmentIds = [...new Set(attachmentIds)]
  const existingReferences = await executor
    .select({ attachmentId: attachmentReferences.attachmentId })
    .from(attachmentReferences)
    .where(sourceReferenceCondition(source))

  const lockedAttachments = await lockActiveAttachmentsByIds(executor, [
    ...existingReferences.map((reference) => reference.attachmentId),
    ...uniqueAttachmentIds,
  ])
  const lockedAttachmentIds = new Set(lockedAttachments.map((attachment) => attachment.id))

  if (uniqueAttachmentIds.some((attachmentId) => !lockedAttachmentIds.has(attachmentId))) {
    throw new AttachmentReferenceTargetInvalidError()
  }

  await executor.delete(attachmentReferences).where(sourceReferenceCondition(source))

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
