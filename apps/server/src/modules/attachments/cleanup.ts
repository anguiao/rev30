import { ATTACHMENT_CLEANUP_POLICY_UNREFERENCED } from '@rev30/contracts'
import { subMilliseconds } from '@rev30/utils'
import { and, asc, eq, isNull, like, lte, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/pg-core'
import type { Logger } from 'pino'
import type { Db } from '../../db'
import { attachmentReferences, attachments, attachmentUploadSessions } from '../../db/schema'
import { AttachmentStorageListError } from './errors'
import { lockActiveAttachmentsByIds } from './references'
import {
  ATTACHMENT_UPLOAD_STORAGE_PREFIX,
  type AttachmentStorage,
  type AttachmentStorageEntry,
} from './storage'

type AttachmentCleanupOptions = {
  signal: AbortSignal
  logger: Logger
}

type AttachmentCleanupResult = {
  deletedCount: number
  failedCount: number
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

async function deleteAttachmentStorageObject(
  storage: AttachmentStorage,
  storageKey: string,
  options: AttachmentCleanupOptions,
  logFields?: { attachmentId: string } | { uploadId: string },
) {
  const { signal, logger } = options
  signal.throwIfAborted()

  try {
    await storage.delete(storageKey)
  } catch (error) {
    signal.throwIfAborted()
    logger.error(
      { err: error, storageKey, ...logFields },
      'attachment cleanup storage deletion failed',
    )
    return false
  }

  signal.throwIfAborted()
  return true
}

export async function cleanupOrphanedAttachmentUploads(
  database: Db,
  storage: AttachmentStorage,
  retentionMs: number,
  options: AttachmentCleanupOptions,
): Promise<AttachmentCleanupResult> {
  const { signal } = options
  const cutoff = subMilliseconds(new Date(), retentionMs)

  signal.throwIfAborted()
  let entries: AttachmentStorageEntry[]
  try {
    entries = await storage.list(ATTACHMENT_UPLOAD_STORAGE_PREFIX)
  } catch (error) {
    signal.throwIfAborted()
    throw new AttachmentStorageListError(error)
  }
  signal.throwIfAborted()
  const candidates = entries.filter((entry) => entry.modifiedAt.getTime() <= cutoff.getTime())

  if (candidates.length === 0) {
    return { deletedCount: 0, failedCount: 0 }
  }

  const protectedRows = await unionAll(
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
  signal.throwIfAborted()

  const protectedStorageKeys = new Set(
    protectedRows.flatMap((row) => (row.storageKey ? [row.storageKey] : [])),
  )
  const protectedUploadIds = new Set(
    protectedRows.flatMap((row) => (row.uploadId ? [row.uploadId] : [])),
  )
  const result: AttachmentCleanupResult = { deletedCount: 0, failedCount: 0 }

  for (const candidate of candidates) {
    if (
      protectedStorageKeys.has(candidate.key) ||
      protectedUploadIds.has(getUploadIdFromUploadStorageKey(candidate.key))
    ) {
      continue
    }

    if (await deleteAttachmentStorageObject(storage, candidate.key, options)) {
      result.deletedCount += 1
    } else {
      result.failedCount += 1
    }
  }

  return result
}

export async function cleanupExpiredAttachmentUploadSessions(
  database: Db,
  storage: AttachmentStorage,
  options: AttachmentCleanupOptions,
): Promise<AttachmentCleanupResult> {
  const { signal } = options
  signal.throwIfAborted()
  const expiredSessions = await database
    .delete(attachmentUploadSessions)
    .where(lte(attachmentUploadSessions.expiresAt, new Date()))
    .returning()
  signal.throwIfAborted()

  const result: AttachmentCleanupResult = {
    deletedCount: expiredSessions.length,
    failedCount: 0,
  }
  for (const session of expiredSessions) {
    if (!session.storageKey || session.storageProvider !== storage.provider) {
      continue
    }

    if (
      !(await deleteAttachmentStorageObject(storage, session.storageKey, options, {
        uploadId: session.id,
      }))
    ) {
      result.failedCount += 1
    }
  }

  return result
}

export async function cleanupUnreferencedAttachments(
  database: Db,
  storage: AttachmentStorage,
  retentionMs: number,
  options: AttachmentCleanupOptions,
): Promise<AttachmentCleanupResult> {
  const { signal } = options
  const cutoff = subMilliseconds(new Date(), retentionMs)
  signal.throwIfAborted()
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
  signal.throwIfAborted()

  const result: AttachmentCleanupResult = { deletedCount: 0, failedCount: 0 }

  for (const candidate of candidates) {
    signal.throwIfAborted()
    const deleted = await database.transaction(async (tx) => {
      signal.throwIfAborted()
      const [locked] = await lockActiveAttachmentsByIds(tx, [candidate.id])
      signal.throwIfAborted()

      if (!locked) {
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
      signal.throwIfAborted()

      return deleted
    })
    signal.throwIfAborted()

    if (!deleted) {
      continue
    }

    result.deletedCount += 1
    if (
      !(await deleteAttachmentStorageObject(storage, deleted.storageKey, options, {
        attachmentId: deleted.id,
      }))
    ) {
      result.failedCount += 1
    }
  }

  return result
}
