import { ATTACHMENT_CLEANUP_POLICY_UNREFERENCED } from '@rev30/contracts'
import { subMilliseconds } from '@rev30/utils'
import { and, asc, eq, isNull, like, lte, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/pg-core'
import type { Db } from '../../db'
import { attachmentReferences, attachments, attachmentUploadSessions } from '../../db/schema'
import { logger } from '../../runtime/logger'
import { lockActiveAttachmentsByIds } from './references'
import { ATTACHMENT_UPLOAD_STORAGE_PREFIX, type AttachmentStorage } from './storage'

function unreferencedAttachmentCondition() {
  return sql`not exists (
    select 1
    from ${attachmentReferences}
    where ${attachmentReferences.attachmentId} = ${attachments.id}
  )`
}

function getUploadIdFromUploadStorageKey(storageKey: string) {
  const filename = storageKey.slice(storageKey.lastIndexOf('/') + 1)
  const extensionSeparator = filename.indexOf('.')

  return extensionSeparator === -1 ? filename : filename.slice(0, extensionSeparator)
}

export async function cleanupOrphanedAttachmentUploads(
  database: Db,
  storage: AttachmentStorage,
  retentionMs: number,
): Promise<number> {
  const cutoff = subMilliseconds(new Date(), retentionMs)
  const candidates = (await storage.list(ATTACHMENT_UPLOAD_STORAGE_PREFIX)).filter(
    (entry) => entry.modifiedAt.getTime() <= cutoff.getTime(),
  )

  if (candidates.length === 0) {
    return 0
  }

  const persistedRows = await unionAll(
    database
      .select({
        storageKey: sql<string | null>`${attachments.storageKey}`.as('storage_key'),
        uploadId: sql<string | null>`null::uuid`.as('upload_id'),
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.storageProvider, storage.provider),
          like(attachments.storageKey, `${ATTACHMENT_UPLOAD_STORAGE_PREFIX}/%`),
          isNull(attachments.deletedAt),
        ),
      ),
    database
      .select({
        storageKey: sql<string | null>`${attachmentUploadSessions.storageKey}`.as('storage_key'),
        uploadId: sql<string | null>`${attachmentUploadSessions.id}`.as('upload_id'),
      })
      .from(attachmentUploadSessions),
  )
  const persistedStorageKeys = new Set(
    persistedRows.flatMap((row) => (row.storageKey ? [row.storageKey] : [])),
  )
  const activeUploadIds = new Set(
    persistedRows.flatMap((row) => (row.uploadId ? [row.uploadId] : [])),
  )
  let deletedCount = 0

  for (const candidate of candidates) {
    if (
      persistedStorageKeys.has(candidate.key) ||
      activeUploadIds.has(getUploadIdFromUploadStorageKey(candidate.key))
    ) {
      continue
    }

    try {
      await storage.delete(candidate.key)
      deletedCount += 1
    } catch (error) {
      logger.error(
        {
          err: error,
          storageKey: candidate.key,
        },
        'orphaned attachment upload deletion failed',
      )
    }
  }

  return deletedCount
}

export async function cleanupExpiredAttachmentUploadSessions(
  database: Db,
  storage: AttachmentStorage,
): Promise<number> {
  const expiredSessions = await database
    .delete(attachmentUploadSessions)
    .where(lte(attachmentUploadSessions.expiresAt, new Date()))
    .returning()

  for (const session of expiredSessions) {
    if (!session.storageKey || session.storageProvider !== storage.provider) {
      continue
    }

    try {
      await storage.delete(session.storageKey)
    } catch (error) {
      logger.error(
        {
          err: error,
          storageKey: session.storageKey,
          uploadId: session.id,
        },
        'expired attachment upload session deletion failed',
      )
    }
  }

  return expiredSessions.length
}

export async function cleanupUnreferencedAttachments(
  database: Db,
  storage: AttachmentStorage,
  retentionMs: number,
): Promise<number> {
  const cutoff = subMilliseconds(new Date(), retentionMs)
  const candidates = await database
    .select({
      id: attachments.id,
    })
    .from(attachments)
    .where(
      and(
        isNull(attachments.deletedAt),
        eq(attachments.storageProvider, storage.provider),
        eq(attachments.cleanupPolicy, ATTACHMENT_CLEANUP_POLICY_UNREFERENCED),
        lte(attachments.createdAt, cutoff),
        unreferencedAttachmentCondition(),
      ),
    )
    .orderBy(asc(attachments.createdAt), asc(attachments.id))

  let deletedCount = 0

  for (const candidate of candidates) {
    const deleted = await database.transaction(async (tx) => {
      const [locked] = await lockActiveAttachmentsByIds(tx, [candidate.id])

      if (
        !locked ||
        locked.storageProvider !== storage.provider ||
        locked.cleanupPolicy !== ATTACHMENT_CLEANUP_POLICY_UNREFERENCED ||
        locked.createdAt.getTime() > cutoff.getTime()
      ) {
        return undefined
      }

      const [reference] = await tx
        .select({ attachmentId: attachmentReferences.attachmentId })
        .from(attachmentReferences)
        .where(eq(attachmentReferences.attachmentId, candidate.id))
        .limit(1)

      if (reference) {
        return undefined
      }

      const [deleted] = await tx
        .update(attachments)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(attachments.id, candidate.id),
            isNull(attachments.deletedAt),
            eq(attachments.storageProvider, storage.provider),
            eq(attachments.cleanupPolicy, ATTACHMENT_CLEANUP_POLICY_UNREFERENCED),
            lte(attachments.createdAt, cutoff),
            unreferencedAttachmentCondition(),
          ),
        )
        .returning()

      return deleted
    })

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
