import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { attachmentReferences, attachments, systemUsers } from '../../../src/db/schema'
import { AttachmentReferenceTargetInvalidError } from '../../../src/modules/attachments/errors'
import {
  deleteAttachmentReferences,
  lockActiveAttachmentsByIds,
  refreshAttachmentReferences,
  type AttachmentReferenceSource,
} from '../../../src/modules/attachments/references'
import { createTestDb } from '../../helpers/db'

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

function createDatabaseWithForUpdateTracking(
  database: Awaited<ReturnType<typeof createTestDb>>,
  calls: unknown[][],
) {
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

async function createAttachmentRows(
  database: Awaited<ReturnType<typeof createTestDb>>,
  attachmentIds: string[],
) {
  const userId = randomUUID()

  await database.insert(systemUsers).values({
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

async function listSourceReferences(
  database: Awaited<ReturnType<typeof createTestDb>>,
  source: AttachmentReferenceSource,
) {
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
  it('locks unique active attachments in stable order', async () => {
    const database = await createTestDb()
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

  it('refreshes source references with unique attachment ids', async () => {
    const database = await createTestDb()
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

  it('rejects references to soft-deleted attachments', async () => {
    const database = await createTestDb()
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
