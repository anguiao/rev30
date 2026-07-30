import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { attachmentUploadSessions, systemUsers } from '../../src/db/schema'
import { createTestDb } from '../helpers/db'

describe('attachment upload session schema', () => {
  it('requires stored sessions to include complete storage metadata', async () => {
    const database = await createTestDb()
    const userId = randomUUID()
    const createdAt = new Date('2026-07-27T00:00:00.000Z')

    await database.insert(systemUsers).values({
      id: userId,
      username: `attachment-session-schema-${userId.slice(0, 8)}`,
      nickname: 'Attachment Session Schema',
    })

    await expect(
      database.transaction(async (tx) => {
        await tx.insert(attachmentUploadSessions).values({
          originalName: 'report.png',
          expectedSize: 1,
          usage: 'schema-test',
          state: 'stored',
          createdBy: userId,
          createdAt,
          updatedAt: createdAt,
          expiresAt: new Date('2026-07-27T00:05:00.000Z'),
        })
      }),
    ).rejects.toThrow()

    await expect(
      database.transaction(async (tx) => {
        await tx.insert(attachmentUploadSessions).values({
          originalName: 'report.png',
          expectedSize: 1,
          usage: 'schema-test',
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
      }),
    ).rejects.toThrow()
  })
})
