import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, vi } from 'vitest'
import type { Logger } from 'pino'
import { ATTACHMENT_CLEANUP_POLICY_UNREFERENCED } from '@rev30/contracts'
import { and, eq } from 'drizzle-orm'
import { attachmentReferences, attachments, attachmentUploadSessions } from '../../../src/db/schema'
import {
  cleanupExpiredAttachmentUploadSessions,
  cleanupOrphanedAttachmentUploads,
  cleanupUnreferencedAttachments,
} from '../../../src/modules/attachments/cleanup'
import {
  AttachmentReferenceTargetInvalidError,
  AttachmentStorageListError,
} from '../../../src/modules/attachments/errors'
import {
  deleteAttachmentReferences,
  lockActiveAttachmentsByIds,
  refreshAttachmentReferences,
  type AttachmentReferenceSource,
} from '../../../src/modules/attachments/references'
import { createAttachmentRepository } from '../../../src/modules/attachments/repository'
import {
  LocalAttachmentStorage,
  type AttachmentStorage,
} from '../../../src/modules/attachments/storage'
import { dbTest, type TestDatabase } from '../../fixtures/database'
import { createSystemUserFixture } from '../../helpers/system'

const dayMs = 24 * 60 * 60 * 1000
const tempDirs: string[] = []

function cleanupOptions() {
  return {
    signal: new AbortController().signal,
    logger: { error: vi.fn() } as unknown as Logger,
  }
}

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachment-cleanup-'))
  tempDirs.push(root)

  return root
}

async function* bodyFromText(text: string) {
  yield new TextEncoder().encode(text)
}

async function writeStoredFile(
  storage: LocalAttachmentStorage,
  root: string,
  key: string,
  modifiedAt: Date,
) {
  await storage.put({ key, body: bodyFromText(key) })
  await utimes(join(root, key), modifiedAt, modifiedAt)
}

function createDatabaseWithBeforeTransaction(
  database: TestDatabase,
  beforeTransaction: () => Promise<void>,
) {
  let called = false

  return new Proxy(database, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (typeof value !== 'function') {
        return value
      }

      if (property !== 'transaction') {
        return value.bind(target)
      }

      return async (...args: unknown[]) => {
        if (!called) {
          called = true
          await beforeTransaction()
        }

        return await Reflect.apply(value, target, args)
      }
    },
  })
}

function createDatabaseWithStorageKeyHandoff(database: TestDatabase, handoff: () => Promise<void>) {
  let completeHandoff: (() => void) | undefined
  let failHandoff: ((reason: unknown) => void) | undefined
  let handoffStarted = false
  const handoffCompleted = new Promise<void>((resolve, reject) => {
    completeHandoff = resolve
    failHandoff = reject
  })

  async function runHandoff() {
    if (handoffStarted) {
      return handoffCompleted
    }

    handoffStarted = true

    try {
      await handoff()
      completeHandoff!()
    } catch (error) {
      failHandoff!(error)
      throw error
    }
  }

  function wrapQuery<T extends object>(query: T): T {
    return new Proxy(query, {
      get(target, property) {
        const value = Reflect.get(target, property, target)

        if (property === 'then' && typeof value === 'function') {
          const toSql = Reflect.get(target, 'toSQL', target)
          const querySql =
            typeof toSql === 'function'
              ? (Reflect.apply(toSql, target, []) as { sql: string }).sql
              : ''
          const readsAttachments = querySql.includes('"attachments"')
          const readsUploadSessions = querySql.includes('"attachment_upload_sessions"')

          if (!readsAttachments && !readsUploadSessions) {
            return value.bind(target)
          }

          const execute = () =>
            new Promise<unknown>((resolve, reject) => {
              Reflect.apply(value, target, [resolve, reject])
            })

          return (
            onFulfilled?: (result: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => {
            const result = (async () => {
              if (readsAttachments && readsUploadSessions) {
                const rows = await execute()

                await runHandoff()

                return rows
              }

              if (readsAttachments) {
                const rows = await execute()

                await runHandoff()

                return rows
              }

              await handoffCompleted

              return execute()
            })()

            return result.then(onFulfilled, onRejected)
          }
        }

        if (typeof value !== 'function') {
          return value
        }

        return (...args: unknown[]) => {
          const result = Reflect.apply(value, target, args)

          return result !== null && typeof result === 'object' ? wrapQuery(result) : result
        }
      },
    })
  }

  return new Proxy(database, {
    get(target, property) {
      const value = Reflect.get(target, property, target)

      if (property === 'select' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const query = Reflect.apply(value, target, args)

          return wrapQuery(query as object)
        }
      }

      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

async function createUser(database: TestDatabase) {
  const userId = randomUUID()

  const user = await createSystemUserFixture(database, {
    id: userId,
    username: `attachment-cleanup-user-${userId.slice(0, 8)}`,
    nickname: 'Attachment Cleanup User',
  })

  return user.id
}

async function createAttachment(
  database: TestDatabase,
  input: {
    createdAt: Date
    createdBy: string
    cleanupPolicy?: string
    id?: string
    storageKey?: string
    updatedAt?: Date
    usage?: string
  },
) {
  const id = input.id ?? randomUUID()

  await database.insert(attachments).values({
    id,
    storageProvider: 'local',
    storageKey: input.storageKey ?? `cleanup/${id}.png`,
    originalName: `${id}.png`,
    mimeType: 'image/png',
    extension: 'png',
    size: 1,
    usage: input.usage ?? 'test-cleanup',
    ...(input.cleanupPolicy ? { cleanupPolicy: input.cleanupPolicy } : {}),
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  })

  return id
}

async function listAttachmentDeletedStates(database: TestDatabase) {
  const rows = await database
    .select({
      deletedAt: attachments.deletedAt,
      id: attachments.id,
    })
    .from(attachments)
    .orderBy(attachments.id)

  return Object.fromEntries(rows.map((row) => [row.id, row.deletedAt]))
}

describe('attachment upload sessions', () => {
  dbTest(
    'requires stored sessions to include complete storage metadata',
    async ({ db: database }) => {
      const userId = await createUser(database)
      const createdAt = new Date('2026-07-27T00:00:00.000Z')
      const expectStorageStateViolation = async (
        values: typeof attachmentUploadSessions.$inferInsert,
      ) => {
        await expect(
          database.transaction(async (transaction) => {
            await transaction.insert(attachmentUploadSessions).values(values)
          }),
        ).rejects.toMatchObject({
          cause: {
            message: expect.stringContaining('attachment_upload_sessions_storage_state_check'),
          },
        })
      }

      await expectStorageStateViolation({
        originalName: 'report.png',
        expectedSize: 1,
        usage: 'test-upload-session',
        state: 'stored',
        createdBy: userId,
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date('2026-07-27T00:05:00.000Z'),
      })
      await expectStorageStateViolation({
        originalName: 'report.png',
        expectedSize: 1,
        usage: 'test-upload-session',
        state: 'stored',
        storageProvider: 'local',
        storageKey: `uploads/${randomUUID()}.png`,
        mimeType: 'image/png',
        extension: 'png',
        storedSize: null,
        checksum: 'stored-checksum',
        storedAt: createdAt,
        createdBy: userId,
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date('2026-07-27T00:05:00.000Z'),
      })
    },
  )
})

describe('attachment cleanup', () => {
  afterEach(async () => {
    vi.useRealTimers()
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  dbTest('marks storage listing failures as storage errors', async ({ db: database }) => {
    const listError = new Error('storage unavailable')
    const storage = {
      provider: 'local',
      put: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockRejectedValue(listError),
      delete: vi.fn(),
    } as unknown as AttachmentStorage

    await expect(
      cleanupOrphanedAttachmentUploads(database, storage, 7 * dayMs, cleanupOptions()),
    ).rejects.toMatchObject({
      name: AttachmentStorageListError.name,
      cause: listError,
    })
  })

  dbTest(
    'continues orphaned storage cleanup after an individual delete failure',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const oldModifiedAt = new Date(Date.now() - 8 * dayMs)
      const firstKey = 'uploads/orphan-delete-fails.bin'
      const secondKey = 'uploads/orphan-delete-succeeds.bin'
      const deleteError = new Error('orphan delete failed')
      const deleting = vi.fn().mockRejectedValueOnce(deleteError).mockResolvedValueOnce(undefined)
      const storage = {
        provider: 'local',
        put: vi.fn(),
        get: vi.fn(),
        list: vi.fn().mockResolvedValue([
          { key: firstKey, modifiedAt: oldModifiedAt },
          { key: secondKey, modifiedAt: oldModifiedAt },
        ]),
        delete: deleting,
      } as unknown as AttachmentStorage
      const options = cleanupOptions()

      await expect(
        cleanupOrphanedAttachmentUploads(database, storage, 7 * dayMs, options),
      ).resolves.toEqual({ deletedCount: 1, failedCount: 1 })
      expect(deleting).toHaveBeenNthCalledWith(1, firstKey)
      expect(deleting).toHaveBeenNthCalledWith(2, secondKey)
      expect(options.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: deleteError }),
        expect.any(String),
      )
    },
  )

  dbTest(
    'retries a soft-deleted attachment through orphaned storage cleanup after storage failure',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const userId = await createUser(database)
      const oldModifiedAt = new Date(Date.now() - 8 * dayMs)
      const storageKey = 'uploads/unreferenced-delete-fails.bin'
      const attachmentId = await createAttachment(database, {
        createdAt: oldModifiedAt,
        createdBy: userId,
        cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
        storageKey,
        updatedAt: oldModifiedAt,
      })
      const deleteError = new Error('unreferenced delete failed')
      const deleting = vi.fn().mockRejectedValueOnce(deleteError).mockResolvedValueOnce(undefined)
      const storage = {
        provider: 'local',
        put: vi.fn(),
        get: vi.fn(),
        list: vi.fn().mockResolvedValue([{ key: storageKey, modifiedAt: oldModifiedAt }]),
        delete: deleting,
      } as unknown as AttachmentStorage
      const options = cleanupOptions()

      await expect(
        cleanupUnreferencedAttachments(database, storage, 7 * dayMs, options),
      ).resolves.toEqual({ deletedCount: 1, failedCount: 1 })
      await expect(
        database
          .select({ deletedAt: attachments.deletedAt })
          .from(attachments)
          .where(eq(attachments.id, attachmentId)),
      ).resolves.toEqual([{ deletedAt: expect.any(Date) }])

      await expect(
        cleanupOrphanedAttachmentUploads(database, storage, 7 * dayMs, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 1, failedCount: 0 })
      expect(deleting).toHaveBeenCalledTimes(2)
      expect(options.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: deleteError }),
        expect.any(String),
      )
    },
  )

  dbTest(
    'isolates storage failures and stops at the next cancellation boundary',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const userId = await createUser(database)
      const expiredUploadId = randomUUID()
      await database.insert(attachmentUploadSessions).values({
        id: expiredUploadId,
        originalName: 'expired.png',
        expectedSize: 1,
        usage: 'cleanup',
        state: 'stored',
        storageProvider: 'local',
        storageKey: `uploads/${expiredUploadId}.png`,
        mimeType: 'image/png',
        extension: 'png',
        storedSize: 1,
        checksum: 'checksum',
        storedAt: new Date(Date.now() - dayMs),
        createdBy: userId,
        createdAt: new Date(Date.now() - dayMs),
        updatedAt: new Date(Date.now() - dayMs),
        expiresAt: new Date(Date.now() - 1),
      })

      const deleteError = new Error('storage unavailable')
      const storage = {
        provider: 'local',
        put: vi.fn(),
        get: vi.fn(),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockRejectedValue(deleteError),
      } as unknown as AttachmentStorage
      const options = cleanupOptions()

      await expect(
        cleanupExpiredAttachmentUploadSessions(database, storage, options),
      ).resolves.toEqual({ deletedCount: 1, failedCount: 1 })
      expect(options.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: deleteError }),
        expect.any(String),
      )

      const controller = new AbortController()
      const deleting = vi.fn().mockImplementation(async () => {
        controller.abort()
      })
      const deletingStorage = {
        provider: 'local',
        put: vi.fn(),
        get: vi.fn(),
        list: vi.fn().mockResolvedValue([
          { key: 'uploads/old-a.bin', modifiedAt: new Date(Date.now() - dayMs) },
          { key: 'uploads/old-b.bin', modifiedAt: new Date(Date.now() - dayMs) },
        ]),
        delete: deleting,
      } as unknown as AttachmentStorage

      await expect(
        cleanupOrphanedAttachmentUploads(database, deletingStorage, 0, {
          signal: controller.signal,
          logger: options.logger,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(deleting).toHaveBeenCalledOnce()
    },
  )

  dbTest(
    'deletes old upload files unless an active attachment or upload session owns them',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const userId = await createUser(database)
      const root = await createTempRoot()
      const storage = new LocalAttachmentStorage(root)
      const oldModifiedAt = new Date(Date.now() - 8 * dayMs)
      const recentModifiedAt = new Date(Date.now() - dayMs)
      const oldOrphanKey = 'uploads/2026/06/28/orphan.png'
      const oldTempKey = 'uploads/2026/06/28/interrupted.png.session.tmp'
      const recentOrphanKey = 'uploads/2026/07/05/recent.png'
      const persistedKey = 'uploads/2026/06/28/persisted.png'
      const activeUploadKey = 'uploads/2026/06/28/active-session.png'
      const activeWritingUploadId = randomUUID()
      const activeWritingKey = `uploads/2026/06/28/${activeWritingUploadId}.png`
      const activeWritingTempKey = `${activeWritingKey}.${randomUUID()}.tmp`

      await writeStoredFile(storage, root, oldOrphanKey, oldModifiedAt)
      await writeStoredFile(storage, root, oldTempKey, oldModifiedAt)
      await writeStoredFile(storage, root, recentOrphanKey, recentModifiedAt)
      const persistedAttachmentId = await createAttachment(database, {
        createdAt: oldModifiedAt,
        createdBy: userId,
        storageKey: persistedKey,
      })
      await writeStoredFile(storage, root, persistedKey, oldModifiedAt)
      await database
        .update(attachments)
        .set({ deletedAt: new Date() })
        .where(eq(attachments.id, persistedAttachmentId))
      await database.insert(attachmentUploadSessions).values({
        originalName: 'active-session.png',
        expectedSize: 1,
        usage: 'cleanup',
        state: 'stored',
        storageProvider: storage.provider,
        storageKey: activeUploadKey,
        mimeType: 'image/png',
        extension: 'png',
        storedSize: 1,
        checksum: 'checksum',
        storedAt: oldModifiedAt,
        createdBy: userId,
        createdAt: oldModifiedAt,
        updatedAt: oldModifiedAt,
        expiresAt: new Date(Date.now() + dayMs),
      })
      await database.insert(attachmentUploadSessions).values({
        id: activeWritingUploadId,
        originalName: 'active-writing.png',
        expectedSize: 1,
        usage: 'cleanup',
        state: 'uploading',
        createdBy: userId,
        createdAt: oldModifiedAt,
        updatedAt: oldModifiedAt,
        expiresAt: new Date(Date.now() + dayMs),
      })
      await writeStoredFile(storage, root, activeUploadKey, oldModifiedAt)
      await writeStoredFile(storage, root, activeWritingKey, oldModifiedAt)
      await writeStoredFile(storage, root, activeWritingTempKey, oldModifiedAt)

      await expect(
        cleanupOrphanedAttachmentUploads(database, storage, 7 * dayMs, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 3, failedCount: 0 })
      await expect(storage.get(oldOrphanKey)).rejects.toThrow()
      await expect(storage.get(oldTempKey)).rejects.toThrow()
      await expect(storage.get(recentOrphanKey)).resolves.toBeDefined()
      await expect(storage.get(persistedKey)).rejects.toThrow()
      await expect(storage.get(activeUploadKey)).resolves.toBeDefined()
      await expect(storage.get(activeWritingKey)).resolves.toBeDefined()
      await expect(storage.get(activeWritingTempKey)).resolves.toBeDefined()
    },
  )

  dbTest(
    'removes expired upload sessions and eventually cleans interrupted upload files',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const userId = await createUser(database)
      const root = await createTempRoot()
      const storage = new LocalAttachmentStorage(root)
      const expiredCreatedAt = new Date(Date.now() - 10 * dayMs)
      const expiredAt = new Date(Date.now() - 8 * dayMs)
      const storedAt = new Date(Date.now() - 9 * dayMs)
      const activeCreatedAt = new Date()
      const interruptedUploadId = randomUUID()
      const storedUploadId = randomUUID()
      const expiredPendingUploadId = randomUUID()
      const activeUploadId = randomUUID()
      const interruptedStorageKey = `uploads/2026/06/26/${interruptedUploadId}.png`
      const storedStorageKey = `uploads/2026/06/26/${storedUploadId}.png`

      await database.insert(attachmentUploadSessions).values([
        {
          id: expiredPendingUploadId,
          originalName: 'pending.png',
          expectedSize: 1,
          usage: 'cleanup',
          state: 'pending',
          createdBy: userId,
          createdAt: expiredCreatedAt,
          updatedAt: expiredCreatedAt,
          expiresAt: expiredAt,
        },
        {
          id: interruptedUploadId,
          originalName: 'interrupted.png',
          expectedSize: 1,
          usage: 'cleanup',
          state: 'uploading',
          createdBy: userId,
          createdAt: expiredCreatedAt,
          updatedAt: storedAt,
          expiresAt: expiredAt,
        },
        {
          id: storedUploadId,
          originalName: 'stored.png',
          expectedSize: 1,
          usage: 'cleanup',
          state: 'stored',
          storageProvider: storage.provider,
          storageKey: storedStorageKey,
          mimeType: 'image/png',
          extension: 'png',
          storedSize: 1,
          checksum: 'checksum',
          storedAt,
          createdBy: userId,
          createdAt: expiredCreatedAt,
          updatedAt: storedAt,
          expiresAt: expiredAt,
        },
        {
          id: activeUploadId,
          originalName: 'active.png',
          expectedSize: 1,
          usage: 'cleanup',
          state: 'pending',
          createdBy: userId,
          createdAt: activeCreatedAt,
          updatedAt: activeCreatedAt,
          expiresAt: new Date(Date.now() + dayMs),
        },
      ])
      await writeStoredFile(storage, root, interruptedStorageKey, expiredAt)
      await writeStoredFile(storage, root, storedStorageKey, storedAt)

      await expect(
        cleanupExpiredAttachmentUploadSessions(database, storage, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 3, failedCount: 0 })
      await expect(storage.get(storedStorageKey)).rejects.toThrow()
      await expect(storage.get(interruptedStorageKey)).resolves.toBeDefined()

      await expect(
        cleanupOrphanedAttachmentUploads(database, storage, 7 * dayMs, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 1, failedCount: 0 })
      await expect(storage.get(interruptedStorageKey)).rejects.toThrow()
      await expect(database.select().from(attachmentUploadSessions)).resolves.toMatchObject([
        {
          id: activeUploadId,
          state: 'pending',
        },
      ])
    },
  )

  dbTest(
    'keeps storage across expiry while a stored session is handed off to attachment metadata',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const userId = await createUser(database)
      const root = await createTempRoot()
      const storage = new LocalAttachmentStorage(root)
      const uploadId = randomUUID()
      const storageKey = `uploads/2026/06/28/${uploadId}.png`
      const storedAt = new Date(Date.now() - 8 * dayMs)
      const expiresAt = new Date(Date.now() - 1_000)
      const completionRequestedAt = new Date(Date.now() - 2_000)

      await database.insert(attachmentUploadSessions).values({
        id: uploadId,
        originalName: 'handoff.png',
        expectedSize: 1,
        usage: 'cleanup',
        state: 'stored',
        storageProvider: storage.provider,
        storageKey,
        mimeType: 'image/png',
        extension: 'png',
        storedSize: 1,
        checksum: 'checksum',
        storedAt,
        createdBy: userId,
        createdAt: storedAt,
        updatedAt: storedAt,
        expiresAt,
      })
      await writeStoredFile(storage, root, storageKey, storedAt)

      let attachmentId: string | undefined
      const racedDatabase = createDatabaseWithStorageKeyHandoff(database, async () => {
        const created = await createAttachmentRepository(database).completeUploadSession(
          uploadId,
          userId,
          completionRequestedAt,
        )

        expect(created).toBeDefined()
        attachmentId = created!.id
      })

      await expect(
        cleanupOrphanedAttachmentUploads(racedDatabase, storage, 7 * dayMs, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 0, failedCount: 0 })
      await expect(storage.get(storageKey)).resolves.toBeDefined()
      await expect(database.select().from(attachmentUploadSessions)).resolves.toEqual([])
      await expect(
        database.select().from(attachments).where(eq(attachments.id, attachmentId!)),
      ).resolves.toMatchObject([
        {
          storageKey,
        },
      ])
    },
  )

  dbTest(
    'soft deletes only old unreferenced attachments with unreferenced cleanup policy',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const storage = new LocalAttachmentStorage(await createTempRoot())
      const userId = await createUser(database)
      const oldCreatedAt = new Date(Date.now() - 8 * dayMs)
      const recentCreatedAt = new Date(Date.now() - dayMs)
      const oldUnreferenced = await createAttachment(database, {
        createdAt: oldCreatedAt,
        createdBy: userId,
        cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
      })
      const oldReferenced = await createAttachment(database, {
        createdAt: oldCreatedAt,
        createdBy: userId,
        cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
      })
      const oldManual = await createAttachment(database, {
        createdAt: oldCreatedAt,
        createdBy: userId,
      })
      const oldUnreferencedOtherUsage = await createAttachment(database, {
        createdAt: oldCreatedAt,
        createdBy: userId,
        cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
        usage: 'other-usage',
      })
      const recentUnreferenced = await createAttachment(database, {
        createdAt: recentCreatedAt,
        createdBy: userId,
        cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
      })

      await refreshAttachmentReferences(
        database,
        {
          sourceType: 'announcement',
          sourceId: randomUUID(),
          sourceField: 'contentJson',
        },
        [oldReferenced],
      )

      await expect(
        cleanupUnreferencedAttachments(database, storage, 7 * dayMs, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 2, failedCount: 0 })

      const deletedStates = await listAttachmentDeletedStates(database)

      expect(deletedStates[oldUnreferenced]).toBeInstanceOf(Date)
      expect(deletedStates[oldReferenced]).toBeNull()
      expect(deletedStates[oldManual]).toBeNull()
      expect(deletedStates[oldUnreferencedOtherUsage]).toBeInstanceOf(Date)
      expect(deletedStates[recentUnreferenced]).toBeNull()
      await expect(database.select().from(attachmentReferences)).resolves.toHaveLength(1)
    },
  )

  dbTest(
    'rechecks references before soft deleting a selected candidate',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const storage = new LocalAttachmentStorage(await createTempRoot())
      const userId = await createUser(database)
      const attachmentId = await createAttachment(database, {
        createdAt: new Date(Date.now() - 8 * dayMs),
        createdBy: userId,
        cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
      })

      let insertedReference = false
      const racedDatabase = createDatabaseWithBeforeTransaction(database, async () => {
        insertedReference = true
        await database.insert(attachmentReferences).values({
          attachmentId,
          sourceType: 'announcement',
          sourceId: randomUUID(),
          sourceField: 'contentJson',
        })
      })

      await expect(
        cleanupUnreferencedAttachments(racedDatabase, storage, 7 * dayMs, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 0, failedCount: 0 })

      const [row] = await database
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachmentId))

      expect(insertedReference).toBe(true)
      expect(row?.deletedAt).toBeNull()
    },
  )

  dbTest(
    'starts a new retention period when the last reference is removed',
    async ({ db: database }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

      const storage = new LocalAttachmentStorage(await createTempRoot())
      const userId = await createUser(database)
      const attachmentId = await createAttachment(database, {
        createdAt: new Date(Date.now() - 30 * dayMs),
        createdBy: userId,
        cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
      })
      const source = testSource()

      await refreshAttachmentReferences(database, source, [attachmentId])
      await deleteAttachmentReferences(database, source)

      const [unreferenced] = await database
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachmentId))

      expect(unreferenced?.updatedAt).toEqual(new Date())
      await expect(
        cleanupUnreferencedAttachments(database, storage, 7 * dayMs, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 0, failedCount: 0 })

      vi.advanceTimersByTime(8 * dayMs)

      await expect(
        cleanupUnreferencedAttachments(database, storage, 7 * dayMs, cleanupOptions()),
      ).resolves.toEqual({ deletedCount: 1, failedCount: 0 })
    },
  )
})

function testSource(): AttachmentReferenceSource {
  return {
    sourceType: 'announcement',
    sourceId: randomUUID(),
    sourceField: 'contentJson',
  }
}

function trackForUpdate<T extends object>(query: T, calls: unknown[][]): T {
  return new Proxy(query, {
    get(target, property) {
      const value = Reflect.get(target, property, target)

      if (typeof value !== 'function') {
        return value
      }

      return (...args: unknown[]) => {
        if (property === 'for') {
          calls.push(args)
        }

        const result = Reflect.apply(value, target, args)

        return result !== null && typeof result === 'object'
          ? trackForUpdate(result, calls)
          : result
      }
    },
  })
}

function createDatabaseWithForUpdateTracking(database: TestDatabase, calls: unknown[][]) {
  return new Proxy(database, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (typeof value !== 'function') {
        return value
      }

      return (...args: unknown[]) => {
        const result = Reflect.apply(value, target, args)

        return property === 'select' && result !== null && typeof result === 'object'
          ? trackForUpdate(result, calls)
          : result
      }
    },
  })
}

async function createAttachmentRows(database: TestDatabase, attachmentIds: string[]) {
  const userId = randomUUID()

  await createSystemUserFixture(database, {
    id: userId,
    username: `attachment-reference-user-${userId.slice(0, 8)}`,
    nickname: 'Attachment Reference User',
  })
  await database.insert(attachments).values(
    attachmentIds.map((id) => ({
      id,
      storageProvider: 'local',
      storageKey: `references/${id}.png`,
      originalName: `${id}.png`,
      mimeType: 'image/png',
      extension: 'png',
      size: 1,
      usage: 'test-reference',
      createdBy: userId,
    })),
  )
}

async function listSourceReferences(database: TestDatabase, source: AttachmentReferenceSource) {
  return await database
    .select()
    .from(attachmentReferences)
    .where(
      and(
        eq(attachmentReferences.sourceType, source.sourceType),
        eq(attachmentReferences.sourceId, source.sourceId),
        eq(attachmentReferences.sourceField, source.sourceField),
      ),
    )
    .orderBy(attachmentReferences.attachmentId)
}

describe('attachment references', () => {
  dbTest('locks unique active attachments in stable order', async ({ db: database }) => {
    const firstAttachmentId = randomUUID()
    const secondAttachmentId = randomUUID()
    const sortedAttachmentIds = [firstAttachmentId, secondAttachmentId].sort()
    const forUpdateCalls: unknown[][] = []

    await createAttachmentRows(database, sortedAttachmentIds)

    const locked = await lockActiveAttachmentsByIds(
      createDatabaseWithForUpdateTracking(database, forUpdateCalls),
      [secondAttachmentId, firstAttachmentId, secondAttachmentId],
    )

    expect(locked.map((attachment) => attachment.id)).toEqual(sortedAttachmentIds)
    expect(forUpdateCalls).toEqual([['update'], ['update']])
  })

  dbTest('refreshes source references with unique attachment ids', async ({ db: database }) => {
    const source = testSource()
    const firstAttachmentId = randomUUID()
    const secondAttachmentId = randomUUID()
    const thirdAttachmentId = randomUUID()
    const forUpdateCalls: unknown[][] = []

    await createAttachmentRows(database, [firstAttachmentId, secondAttachmentId, thirdAttachmentId])
    await refreshAttachmentReferences(
      createDatabaseWithForUpdateTracking(database, forUpdateCalls),
      source,
      [firstAttachmentId, secondAttachmentId, firstAttachmentId],
    )

    expect((await listSourceReferences(database, source)).map((row) => row.attachmentId)).toEqual(
      [firstAttachmentId, secondAttachmentId].sort(),
    )
    expect(forUpdateCalls).toEqual([['update'], ['update']])

    await refreshAttachmentReferences(database, source, [thirdAttachmentId])

    expect(await listSourceReferences(database, source)).toMatchObject([
      {
        attachmentId: thirdAttachmentId,
        sourceField: source.sourceField,
        sourceId: source.sourceId,
        sourceType: source.sourceType,
      },
    ])

    await deleteAttachmentReferences(database, source)

    expect(await listSourceReferences(database, source)).toEqual([])
  })

  dbTest('rejects references to soft-deleted attachments', async ({ db: database }) => {
    const source = testSource()
    const attachmentId = randomUUID()

    await createAttachmentRows(database, [attachmentId])
    await database
      .update(attachments)
      .set({ deletedAt: new Date() })
      .where(eq(attachments.id, attachmentId))

    await expect(
      refreshAttachmentReferences(database, source, [attachmentId]),
    ).rejects.toBeInstanceOf(AttachmentReferenceTargetInvalidError)
    expect(await listSourceReferences(database, source)).toEqual([])
  })
})
