import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import { attachments, systemUsers } from '../../../src/db/schema'
import { readAttachmentConfig } from '../../../src/modules/attachments/config'
import { AttachmentNotFoundError } from '../../../src/modules/attachments/errors'
import { createAttachmentService } from '../../../src/modules/attachments/service'
import { LocalAttachmentStorage } from '../../../src/modules/attachments/storage'
import { createTestDb } from '../../helpers/db'

const tempDirs: string[] = []
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52,
])

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachments-service-'))
  tempDirs.push(root)

  return root
}

async function createUser(database: Awaited<ReturnType<typeof createTestDb>>) {
  const userId = randomUUID()
  const now = new Date('2026-05-29T00:00:00.000Z')

  await database.insert(systemUsers).values({
    id: userId,
    username: `attachment-service-user-${randomUUID()}`,
    nickname: 'Attachment Service User',
    status: USER_STATUS_ENABLED,
    createdAt: now,
    updatedAt: now,
  })

  return userId
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('attachment service', () => {
  it('uploads files, stores metadata, and creates signed URLs', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const service = createAttachmentService(database, {
      config: readAttachmentConfig({
        ATTACHMENT_SIGNING_SECRET: 'test-secret',
        ATTACHMENT_STORAGE_DIR: root,
      }),
      now: () => new Date('2026-05-29T00:00:00.000Z'),
      storage: new LocalAttachmentStorage(root),
    })
    const userId = await createUser(database)
    const file = new File([pngBytes], 'avatar.png', { type: 'application/octet-stream' })

    const attachment = await service.upload({
      file,
      usage: ATTACHMENT_USAGE_AVATAR,
      userId,
    })

    expect(attachment).toMatchObject({
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: pngBytes.byteLength,
      usage: ATTACHMENT_USAGE_AVATAR,
    })

    const [row] = await database.select().from(attachments)
    expect(row).toMatchObject({
      id: attachment.id,
      storageProvider: 'local',
      storageKey: `2026/05/29/${attachment.id}.png`,
      createdBy: userId,
    })

    const signed = await service.createSignedUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      origin: 'http://localhost',
    })

    expect(signed.url).toContain(`/api/attachments/${attachment.id}/content?token=`)
    expect(signed.expiresAt).toBe('2026-05-29T00:05:00.000Z')
  })

  it('does not sign deleted attachments', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const service = createAttachmentService(database, {
      config: readAttachmentConfig({
        ATTACHMENT_SIGNING_SECRET: 'test-secret',
        ATTACHMENT_STORAGE_DIR: root,
      }),
      now: () => new Date('2026-05-29T00:00:00.000Z'),
      storage: new LocalAttachmentStorage(root),
    })
    const userId = await createUser(database)
    const attachment = await service.upload({
      file: new File([pngBytes], 'avatar.png'),
      usage: ATTACHMENT_USAGE_AVATAR,
      userId,
    })

    await service.delete(attachment.id)

    await expect(
      service.createSignedUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        origin: 'http://localhost',
      }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError)
  })
})
