import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { DbExecutor, DbReader } from '../../db'
import { attachmentReferences, attachments } from '../../db/schema'
import { AttachmentReferenceTargetInvalidError } from './errors'

export type AttachmentReferenceSource = {
  sourceType: string
  sourceId: string
  sourceField: string
}

export interface RefreshAttachmentReferencesOptions {
  validateTargets?: (
    lockedAttachments: readonly (typeof attachments.$inferSelect)[],
    targetAttachmentIds: readonly string[],
  ) => void | Promise<void>
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
  options: RefreshAttachmentReferencesOptions = {},
) {
  const uniqueAttachmentIds = [...new Set(attachmentIds)]
  const nextAttachmentIds = new Set(uniqueAttachmentIds)
  const existingReferences = await executor
    .select({ attachmentId: attachmentReferences.attachmentId })
    .from(attachmentReferences)
    .where(sourceReferenceCondition(source))
  const removedAttachmentIds = existingReferences
    .map((reference) => reference.attachmentId)
    .filter((attachmentId) => !nextAttachmentIds.has(attachmentId))

  const lockedAttachments = await lockActiveAttachmentsByIds(executor, [
    ...existingReferences.map((reference) => reference.attachmentId),
    ...uniqueAttachmentIds,
  ])
  const lockedAttachmentIds = new Set(lockedAttachments.map((attachment) => attachment.id))

  if (uniqueAttachmentIds.some((attachmentId) => !lockedAttachmentIds.has(attachmentId))) {
    throw new AttachmentReferenceTargetInvalidError()
  }

  await options.validateTargets?.(lockedAttachments, uniqueAttachmentIds)

  await executor.delete(attachmentReferences).where(sourceReferenceCondition(source))

  if (removedAttachmentIds.length > 0) {
    await executor
      .update(attachments)
      .set({ updatedAt: new Date() })
      .where(and(inArray(attachments.id, removedAttachmentIds), isNull(attachments.deletedAt)))
  }

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
