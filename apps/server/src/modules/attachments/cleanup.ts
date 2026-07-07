import { ATTACHMENT_CLEANUP_POLICY_UNREFERENCED } from '@rev30/contracts'
import { subMilliseconds } from '@rev30/utils'
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../../db'
import { attachmentReferences, attachments } from '../../db/schema'
import { logger } from '../../runtime/logger'
import { readAttachmentConfig } from './config'
import { LocalAttachmentStorage } from './storage'

function unreferencedAttachmentCondition() {
  return sql`not exists (
    select 1
    from ${attachmentReferences}
    where ${attachmentReferences.attachmentId} = ${attachments.id}
  )`
}

export async function cleanupUnreferencedAttachments(
  database: Db,
  retentionMs: number,
): Promise<number> {
  const cutoff = subMilliseconds(new Date(), retentionMs)
  const storage = new LocalAttachmentStorage(readAttachmentConfig().storageDir)
  const candidates = await database
    .select({
      id: attachments.id,
    })
    .from(attachments)
    .where(
      and(
        isNull(attachments.deletedAt),
        eq(attachments.cleanupPolicy, ATTACHMENT_CLEANUP_POLICY_UNREFERENCED),
        lte(attachments.createdAt, cutoff),
        unreferencedAttachmentCondition(),
      ),
    )
    .orderBy(asc(attachments.createdAt), asc(attachments.id))

  let deletedCount = 0

  for (const candidate of candidates) {
    const [deleted] = await database
      .update(attachments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(attachments.id, candidate.id),
          isNull(attachments.deletedAt),
          eq(attachments.cleanupPolicy, ATTACHMENT_CLEANUP_POLICY_UNREFERENCED),
          lte(attachments.createdAt, cutoff),
          unreferencedAttachmentCondition(),
        ),
      )
      .returning()

    if (!deleted) {
      continue
    }

    deletedCount += 1

    try {
      await storage.delete(deleted.storageKey)
    } catch (error) {
      logger.error(
        {
          attachmentId: deleted.id,
          err: error,
          storageKey: deleted.storageKey,
        },
        'attachment storage deletion failed',
      )
    }
  }

  return deletedCount
}
