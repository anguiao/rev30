import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import type { Db } from '../../../src/db'
import { attachments, systemUsers } from '../../../src/db/schema'
import { readAttachmentConfig } from '../../../src/modules/attachments/config'
import { AttachmentNotFoundError } from '../../../src/modules/attachments/errors'
import { createAttachmentService } from '../../../src/modules/attachments/service'
import { logger } from '../../../src/runtime/logger'
import {
  LocalAttachmentStorage,
  type AttachmentStorage,
} from '../../../src/modules/attachments/storage'
import { createTestDb } from '../../helpers/db'

const tempDirs: string[] = []
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52,
])
const pngChecksum = createHash('sha256').update(pngBytes).digest('hex')

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

async function streamToBytes(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function createAttachmentServiceForTest(
  database: Awaited<ReturnType<typeof createTestDb>> | Db,
  root: string,
  storage: AttachmentStorage = new LocalAttachmentStorage(root),
) {
  return createAttachmentService(database as Db, {
    config: readAttachmentConfig({
      ATTACHMENT_SIGNING_SECRET: 'test-secret',
      ATTACHMENT_STORAGE_DIR: root,
    }),
    now: () => new Date('2026-05-29T00:00:00.000Z'),
    storage,
  })
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('attachment service', () => {
  it('uploads files, stores metadata, and creates signed URLs', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const service = createAttachmentServiceForTest(database, root)
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
      size: pngBytes.byteLength,
      checksum: pngChecksum,
      createdBy: userId,
    })

    const signed = await service.createSignedUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      origin: 'http://localhost',
    })

    expect(signed.url).toContain(`/api/attachments/${attachment.id}/content?token=`)
    expect(signed.expiresAt).toBe('2026-05-29T00:05:00.000Z')
  })

  it.each(['http://localhost/admin?x=1', 'http://localhost/'])(
    'normalizes signed url origin from %s',
    async (origin) => {
      const database = await createTestDb()
      const root = await createTempRoot()
      const service = createAttachmentServiceForTest(database, root)
      const userId = await createUser(database)
      const attachment = await service.upload({
        file: new File([pngBytes], 'avatar.png'),
        usage: ATTACHMENT_USAGE_AVATAR,
        userId,
      })

      const signed = await service.createSignedUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        origin,
      })

      expect(signed.url).toMatch(
        new RegExp(`^http://localhost/api/attachments/${attachment.id}/content\\?token=`),
      )
    },
  )

  it('does not sign deleted attachments', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const service = createAttachmentServiceForTest(database, root)
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

  it('reads stored content with signed token and response headers', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const service = createAttachmentServiceForTest(database, root)
    const userId = await createUser(database)
    const attachment = await service.upload({
      file: new File([pngBytes], 'avatar.png'),
      usage: ATTACHMENT_USAGE_AVATAR,
      userId,
    })
    const signed = await service.createSignedUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      origin: 'http://localhost',
    })
    const token = new URL(signed.url).searchParams.get('token')

    expect(token).toBeTruthy()

    const content = await service.readContent(attachment.id, token!)

    expect(await streamToBytes(content.body)).toEqual(pngBytes)
    expect(content.headers).toEqual({
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline; filename="avatar.png"',
      'Content-Length': String(pngBytes.byteLength),
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
    })
  })

  it('deletes stored file when metadata insert fails', async () => {
    const root = await createTempRoot()
    const put = vi.fn(async ({ key, expectedSize }: Parameters<AttachmentStorage['put']>[0]) => ({
      checksum: 'storage-checksum',
      size: expectedSize,
    }))
    const remove = vi.fn(async (_key: string) => {})
    const storage: AttachmentStorage = {
      delete: remove,
      get: vi.fn(),
      put,
    }
    const database = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => {
            throw new Error('insert failed')
          }),
        })),
      })),
    } as unknown as Db
    const service = createAttachmentServiceForTest(database, root, storage)

    await expect(
      service.upload({
        file: new File([pngBytes], 'avatar.png'),
        usage: ATTACHMENT_USAGE_AVATAR,
        userId: randomUUID(),
      }),
    ).rejects.toThrow('insert failed')

    expect(put).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(put.mock.calls[0]?.[0].key)
  })

  it('preserves insert failure when upload cleanup also fails', async () => {
    const root = await createTempRoot()
    const originalError = new Error('insert failed')
    const cleanupError = new Error('cleanup failed')
    const put = vi.fn(async ({ expectedSize }: Parameters<AttachmentStorage['put']>[0]) => ({
      checksum: 'storage-checksum',
      size: expectedSize,
    }))
    const remove = vi.fn(async (_key: string) => {
      throw cleanupError
    })
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const storage: AttachmentStorage = {
      delete: remove,
      get: vi.fn(),
      put,
    }
    const database = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => {
            throw originalError
          }),
        })),
      })),
    } as unknown as Db
    const service = createAttachmentServiceForTest(database, root, storage)

    await expect(
      service.upload({
        file: new File([pngBytes], 'avatar.png'),
        usage: ATTACHMENT_USAGE_AVATAR,
        userId: randomUUID(),
      }),
    ).rejects.toBe(originalError)

    expect(remove).toHaveBeenCalledTimes(1)
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: cleanupError,
        storageKey: put.mock.calls[0]?.[0].key,
      }),
      'attachment upload cleanup failed',
    )
  })

  it('resolves delete when storage cleanup fails after soft delete', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const localStorage = new LocalAttachmentStorage(root)
    const storageDeleteError = new Error('delete failed')
    const storage: AttachmentStorage = {
      delete: vi.fn(async (_key: string) => {
        throw storageDeleteError
      }),
      get: localStorage.get.bind(localStorage),
      put: localStorage.put.bind(localStorage),
    }
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const service = createAttachmentServiceForTest(database, root, storage)
    const userId = await createUser(database)
    const attachment = await service.upload({
      file: new File([pngBytes], 'avatar.png'),
      usage: ATTACHMENT_USAGE_AVATAR,
      userId,
    })

    await expect(service.delete(attachment.id)).resolves.toBeUndefined()

    await expect(
      service.createSignedUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        origin: 'http://localhost',
      }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError)
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentId: attachment.id,
        err: storageDeleteError,
        storageKey: `2026/05/29/${attachment.id}.png`,
      }),
      'attachment storage deletion failed',
    )
  })

  it('rejects old signed token after attachment delete', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const service = createAttachmentServiceForTest(database, root)
    const userId = await createUser(database)
    const attachment = await service.upload({
      file: new File([pngBytes], 'avatar.png'),
      usage: ATTACHMENT_USAGE_AVATAR,
      userId,
    })
    const signed = await service.createSignedUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      origin: 'http://localhost',
    })
    const token = new URL(signed.url).searchParams.get('token')

    expect(token).toBeTruthy()

    await service.delete(attachment.id)

    await expect(service.readContent(attachment.id, token!)).rejects.toBeInstanceOf(
      AttachmentNotFoundError,
    )
  })
})
