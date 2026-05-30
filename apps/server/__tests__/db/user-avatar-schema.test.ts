import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { ATTACHMENT_USAGE_AVATAR, USER_STATUS_ENABLED } from '@rev30/contracts'
import { attachments, systemUsers } from '../../src/db/schema'
import { createTestDb } from '../helpers/db'

describe('user avatar schema', () => {
  it('stores user avatar references without clearing them when attachments are soft-deleted', async () => {
    const database = await createTestDb()
    const userId = randomUUID()
    const attachmentId = randomUUID()
    const now = new Date('2026-05-30T00:00:00.000Z')

    await database.insert(systemUsers).values({
      id: userId,
      username: `avatar-user-${randomUUID()}`,
      nickname: 'Avatar User',
      status: USER_STATUS_ENABLED,
      createdAt: now,
      updatedAt: now,
    })

    await database.insert(attachments).values({
      id: attachmentId,
      storageProvider: 'local',
      storageKey: `2026/05/30/${attachmentId}.png`,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_AVATAR,
      createdBy: userId,
      createdAt: now,
    })

    await database.update(systemUsers).set({ avatarId: attachmentId }).where(eq(systemUsers.id, userId))
    await database.update(attachments).set({ deletedAt: now }).where(eq(attachments.id, attachmentId))

    const storedUser = await database.query.systemUsers.findFirst({
      where: eq(systemUsers.id, userId),
    })

    expect(storedUser?.avatarId).toBe(attachmentId)
  })
})
