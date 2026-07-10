import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ATTACHMENT_CLEANUP_POLICY_UNREFERENCED } from '@rev30/contracts'
import { eq } from 'drizzle-orm'
import { attachmentReferences, attachments, systemUsers } from '../../../src/db/schema'
import {
  cleanupOrphanedAttachmentUploads,
  cleanupUnreferencedAttachments,
} from '../../../src/modules/attachments/cleanup'
import { refreshAttachmentReferences } from '../../../src/modules/attachments/references'
import { LocalAttachmentStorage } from '../../../src/modules/attachments/storage'
import { createTestDb } from '../../helpers/db'

const dayMs = 24 * 60 * 60 * 1000
const tempDirs: string[] = []

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
  database: Awaited<ReturnType<typeof createTestDb>>,
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

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createUser(database: Awaited<ReturnType<typeof createTestDb>>) {
  const userId = randomUUID()

  await database.insert(systemUsers).values({
    id: userId,
    username: `attachment-cleanup-user-${userId.slice(0, 8)}`,
    nickname: 'Attachment Cleanup User',
  })

  return userId
}

async function createAttachment(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: {
    createdAt: Date
    createdBy: string
    cleanupPolicy?: string
    id?: string
    storageKey?: string
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
  })

  return id
}

async function listAttachmentDeletedStates(database: Awaited<ReturnType<typeof createTestDb>>) {
  const rows = await database
    .select({
      deletedAt: attachments.deletedAt,
      id: attachments.id,
    })
    .from(attachments)
    .orderBy(attachments.id)

  return Object.fromEntries(rows.map((row) => [row.id, row.deletedAt]))
}

describe('attachment cleanup', () => {
  it('deletes only old upload files without attachment metadata', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

    const database = await createTestDb()
    const userId = await createUser(database)
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)
    const oldModifiedAt = new Date(Date.now() - 8 * dayMs)
    const recentModifiedAt = new Date(Date.now() - dayMs)
    const oldOrphanKey = 'uploads/2026/06/28/orphan.png'
    const oldTempKey = 'uploads/2026/06/28/interrupted.png.session.tmp'
    const recentOrphanKey = 'uploads/2026/07/05/recent.png'
    const persistedKey = 'uploads/2026/06/28/persisted.png'

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

    await expect(cleanupOrphanedAttachmentUploads(database, storage, 7 * dayMs)).resolves.toBe(2)
    await expect(storage.get(oldOrphanKey)).rejects.toThrow()
    await expect(storage.get(oldTempKey)).rejects.toThrow()
    await expect(storage.get(recentOrphanKey)).resolves.toBeDefined()
    await expect(storage.get(persistedKey)).resolves.toBeDefined()
  })

  it('soft deletes only old unreferenced attachments with unreferenced cleanup policy', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

    const database = await createTestDb()
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

    await expect(cleanupUnreferencedAttachments(database, storage, 7 * dayMs)).resolves.toBe(2)

    const deletedStates = await listAttachmentDeletedStates(database)

    expect(deletedStates[oldUnreferenced]).toBeInstanceOf(Date)
    expect(deletedStates[oldReferenced]).toBeNull()
    expect(deletedStates[oldManual]).toBeNull()
    expect(deletedStates[oldUnreferencedOtherUsage]).toBeInstanceOf(Date)
    expect(deletedStates[recentUnreferenced]).toBeNull()
    await expect(database.select().from(attachmentReferences)).resolves.toHaveLength(1)
  })

  it('rechecks references before soft deleting a selected candidate', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

    const database = await createTestDb()
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

    await expect(cleanupUnreferencedAttachments(racedDatabase, storage, 7 * dayMs)).resolves.toBe(0)

    const [row] = await database.select().from(attachments).where(eq(attachments.id, attachmentId))

    expect(insertedReference).toBe(true)
    expect(row?.deletedAt).toBeNull()
  })
})
