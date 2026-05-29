import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { ATTACHMENT_USAGE_GENERAL, USER_STATUS_ENABLED } from '@rev30/contracts'
import { eq } from 'drizzle-orm'
import { attachments, systemUsers } from '../../src/db/schema'
import { createTestDb } from '../helpers/db'

describe('attachments schema', () => {
  it('stores attachment metadata with a unique storage key', async () => {
    const database = await createTestDb()
    const userId = randomUUID()
    const now = new Date('2026-05-29T00:00:00.000Z')

    await database.insert(systemUsers).values({
      id: userId,
      username: `attachment-user-${randomUUID()}`,
      nickname: 'Attachment User',
      status: USER_STATUS_ENABLED,
      createdAt: now,
      updatedAt: now,
    })

    const attachmentId = randomUUID()

    const [created] = await database
      .insert(attachments)
      .values({
        id: attachmentId,
        storageProvider: 'local',
        storageKey: '2026/05/29/file.png',
        originalName: 'file.png',
        mimeType: 'image/png',
        extension: 'png',
        size: 128,
        usage: ATTACHMENT_USAGE_GENERAL,
        checksum: 'a'.repeat(64),
        createdBy: userId,
        createdAt: now,
      })
      .returning()

    expect(created).toMatchObject({
      id: attachmentId,
      storageProvider: 'local',
      storageKey: '2026/05/29/file.png',
      originalName: 'file.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_GENERAL,
      checksum: 'a'.repeat(64),
      createdBy: userId,
      createdAt: now,
    })
    expect(created?.deletedAt).toBeNull()

    const [row] = await database.select().from(attachments).where(eq(attachments.id, created!.id))

    expect(row).toMatchObject({
      id: attachmentId,
      storageProvider: 'local',
      storageKey: '2026/05/29/file.png',
      originalName: 'file.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_GENERAL,
      checksum: 'a'.repeat(64),
      createdBy: userId,
      createdAt: now,
      deletedAt: null,
    })

    await expect(
      database.insert(attachments).values({
        id: randomUUID(),
        storageProvider: 'local',
        storageKey: '2026/05/29/file.png',
        originalName: 'file-duplicate.png',
        mimeType: 'image/png',
        extension: 'png',
        size: 256,
        usage: ATTACHMENT_USAGE_GENERAL,
        checksum: 'b'.repeat(64),
        createdBy: userId,
        createdAt: now,
      }),
    ).rejects.toThrow()
  })
})
