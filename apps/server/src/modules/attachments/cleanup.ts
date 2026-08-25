import { ATTACHMENT_CLEANUP_POLICY_UNREFERENCED } from '@rev30/contracts'
import { subMilliseconds } from '@rev30/utils'
import { and, asc, eq, isNull, like, lte, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/pg-core'
import type { Logger } from 'pino'
import type { Db } from '../../db'
import { attachmentReferences, attachments, attachmentUploadSessions } from '../../db/schema'
import { lockActiveAttachmentsByIds } from './references'
import { ATTACHMENT_UPLOAD_STORAGE_PREFIX, type AttachmentStorage } from './storage'

export type AttachmentCleanupContext = {
  signal: AbortSignal
  logger: Logger
}

export class AttachmentCleanupStorageError extends Error {
  constructor(cause: unknown) {
    super('Attachment cleanup storage operation failed', { cause })
    this.name = 'AttachmentCleanupStorageError'
  }
}

function assertNotAborted(signal: AbortSignal) {
  signal.throwIfAborted()
}

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function hasActiveStorageReference(
  database: Db,
  storage: AttachmentStorage,
  storageKey: string,
  signal: AbortSignal,
) {
  assertNotAborted(signal)
  const [attachment] = await database
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .where(
      and(
        eq(attachments.storageProvider, storage.provider),
        eq(attachments.storageKey, storageKey),
        isNull(attachments.deletedAt),
      ),
    )
    .limit(1)
  assertNotAborted(signal)
  if (attachment) return true

  const uploadId = getUploadIdFromUploadStorageKey(storageKey)
  if (!isUuid(uploadId)) return false

  const [uploadSession] = await database
    .select({ id: attachmentUploadSessions.id })
    .from(attachmentUploadSessions)
    .where(eq(attachmentUploadSessions.id, uploadId))
    .limit(1)
  assertNotAborted(signal)
  return uploadSession !== undefined
}

export async function cleanupOrphanedAttachmentUploads(
  database: Db,
  storage: AttachmentStorage,
  retentionMs: number,
  context: AttachmentCleanupContext,
): Promise<{ deletedCount: number; failedCount: number }> {
  const { signal, logger } = context
  const cutoff = subMilliseconds(new Date(), retentionMs)

  assertNotAborted(signal)
  let candidates
  try {
    candidates = await storage.list(ATTACHMENT_UPLOAD_STORAGE_PREFIX)
  } catch (error) {
    throw new AttachmentCleanupStorageError(error)
  }
  assertNotAborted(signal)
  candidates = candidates.filter((entry) => entry.modifiedAt.getTime() <= cutoff.getTime())

  if (candidates.length === 0) {
    return { deletedCount: 0, failedCount: 0 }
  }

  assertNotAborted(signal)
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
  assertNotAborted(signal)

  const persistedStorageKeys = new Set(
    persistedRows.flatMap((row) => (row.storageKey ? [row.storageKey] : [])),
  )
  const activeUploadIds = new Set(
    persistedRows.flatMap((row) => (row.uploadId ? [row.uploadId] : [])),
  )
  let deletedCount = 0
  let failedCount = 0

  for (const candidate of candidates) {
    assertNotAborted(signal)
    if (
      persistedStorageKeys.has(candidate.key) ||
      activeUploadIds.has(getUploadIdFromUploadStorageKey(candidate.key))
    ) {
      continue
    }

    if (await hasActiveStorageReference(database, storage, candidate.key, signal)) {
      continue
    }

    assertNotAborted(signal)
    try {
      await storage.delete(candidate.key)
      deletedCount += 1
      assertNotAborted(signal)
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted()
      failedCount += 1
      logger.error(
        { err: error, storageKey: candidate.key },
        'orphaned attachment storage deletion failed',
      )
    }
  }

  return { deletedCount, failedCount }
}

export async function cleanupExpiredAttachmentUploadSessions(
  database: Db,
  storage: AttachmentStorage,
  context: AttachmentCleanupContext,
): Promise<{ deletedCount: number; failedCount: number }> {
  const { signal, logger } = context
  assertNotAborted(signal)
  const expiredSessions = await database
    .delete(attachmentUploadSessions)
    .where(lte(attachmentUploadSessions.expiresAt, new Date()))
    .returning()
  assertNotAborted(signal)

  let failedCount = 0
  for (const session of expiredSessions) {
    assertNotAborted(signal)
    if (!session.storageKey || session.storageProvider !== storage.provider) {
      continue
    }

    assertNotAborted(signal)
    try {
      await storage.delete(session.storageKey)
      assertNotAborted(signal)
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted()
      failedCount += 1
      logger.error(
        { err: error, storageKey: session.storageKey, uploadId: session.id },
        'expired attachment upload session storage deletion failed',
      )
    }
  }

  return { deletedCount: expiredSessions.length, failedCount }
}

export async function cleanupUnreferencedAttachments(
  database: Db,
  storage: AttachmentStorage,
  retentionMs: number,
  context: AttachmentCleanupContext,
): Promise<{ deletedCount: number; failedCount: number }> {
  const { signal, logger } = context
  const cutoff = subMilliseconds(new Date(), retentionMs)
  assertNotAborted(signal)
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
        lte(attachments.updatedAt, cutoff),
        unreferencedAttachmentCondition(),
      ),
    )
    .orderBy(asc(attachments.updatedAt), asc(attachments.id))
  assertNotAborted(signal)

  let deletedCount = 0
  let failedCount = 0

  for (const candidate of candidates) {
    assertNotAborted(signal)
    const deleted = await database.transaction(async (tx) => {
      assertNotAborted(signal)
      const [locked] = await lockActiveAttachmentsByIds(tx, [candidate.id])
      assertNotAborted(signal)

      if (
        !locked ||
        locked.storageProvider !== storage.provider ||
        locked.cleanupPolicy !== ATTACHMENT_CLEANUP_POLICY_UNREFERENCED ||
        locked.updatedAt.getTime() > cutoff.getTime()
      ) {
        return undefined
      }

      const [reference] = await tx
        .select({ attachmentId: attachmentReferences.attachmentId })
        .from(attachmentReferences)
        .where(eq(attachmentReferences.attachmentId, candidate.id))
        .limit(1)
      assertNotAborted(signal)

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
            lte(attachments.updatedAt, cutoff),
            unreferencedAttachmentCondition(),
          ),
        )
        .returning()
      assertNotAborted(signal)

      return deleted
    })
    assertNotAborted(signal)

    if (!deleted) {
      continue
    }

    deletedCount += 1
    assertNotAborted(signal)
    try {
      await storage.delete(deleted.storageKey)
      assertNotAborted(signal)
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted()
      failedCount += 1
      logger.error(
        { attachmentId: deleted.id, err: error, storageKey: deleted.storageKey },
        'unreferenced attachment storage deletion failed',
      )
    }
  }

  return { deletedCount, failedCount }
}
