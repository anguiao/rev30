import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { ATTACHMENT_CLEANUP_POLICY_UNREFERENCED } from '@rev30/contracts'
import { eq } from 'drizzle-orm'
import { attachmentReferences, attachments, systemUsers } from '../../../src/db/schema'
import { cleanupUnreferencedAttachments } from '../../../src/modules/attachments/cleanup'
import { refreshAttachmentReferences } from '../../../src/modules/attachments/references'
import { createTestDb } from '../../helpers/db'

const dayMs = 24 * 60 * 60 * 1000

function runBeforeQuery<T extends object>(query: T, beforeQuery: () => Promise<void>): T {
  return new Proxy(query, {
    get(target, property) {
      if (property === 'then') {
        const then = Reflect.get(target, property, target) as (
          onFulfilled: (value: unknown) => unknown,
          onRejected: (reason: unknown) => unknown,
        ) => unknown

        return async (
          onFulfilled: (value: unknown) => unknown,
          onRejected: (reason: unknown) => unknown,
        ) => {
          try {
            await beforeQuery()
            return then.call(target, onFulfilled, onRejected)
          } catch (error) {
            return onRejected(error)
          }
        }
      }

      const value = Reflect.get(target, property, target)

      if (typeof value !== 'function') {
        return value
      }

      return (...args: unknown[]) => {
        const result = Reflect.apply(value, target, args)

        return result !== null && typeof result === 'object'
          ? runBeforeQuery(result, beforeQuery)
          : result
      }
    },
  })
}

function createDatabaseWithBeforeUpdate(
  database: Awaited<ReturnType<typeof createTestDb>>,
  beforeUpdate: () => Promise<void>,
) {
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === 'update') {
        return ((table: typeof attachments) =>
          runBeforeQuery(database.update(table), beforeUpdate)) as typeof database.update
      }

      const value = Reflect.get(target, property, receiver)

      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

afterEach(() => {
  vi.useRealTimers()
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
    usage?: string
  },
) {
  const id = input.id ?? randomUUID()

  await database.insert(attachments).values({
    id,
    storageProvider: 'local',
    storageKey: `cleanup/${id}.png`,
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
  it('soft deletes only old unreferenced attachments with unreferenced cleanup policy', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'))

    const database = await createTestDb()
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

    await expect(cleanupUnreferencedAttachments(database, 7 * dayMs)).resolves.toBe(2)

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
    const userId = await createUser(database)
    const attachmentId = await createAttachment(database, {
      createdAt: new Date(Date.now() - 8 * dayMs),
      createdBy: userId,
      cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
    })

    let insertedReference = false
    const racedDatabase = createDatabaseWithBeforeUpdate(database, async () => {
      insertedReference = true
      await database.insert(attachmentReferences).values({
        attachmentId,
        sourceType: 'announcement',
        sourceId: randomUUID(),
        sourceField: 'contentJson',
      })
    })

    await expect(cleanupUnreferencedAttachments(racedDatabase, 7 * dayMs)).resolves.toBe(0)

    const [row] = await database.select().from(attachments).where(eq(attachments.id, attachmentId))

    expect(insertedReference).toBe(true)
    expect(row?.deletedAt).toBeNull()
  })
})
