import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  type AttachmentUsage,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import { attachments, systemUsers } from '../../../src/db/schema'
import {
  AttachmentFileTooLargeError,
  AttachmentNotFoundError,
} from '../../../src/modules/attachments/errors'
import { ATTACHMENT_MAX_SIZE_BYTES } from '../../../src/modules/attachments/policy'
import { createAttachmentService } from '../../../src/modules/attachments/service'
import { createTestDb } from '../../helpers/db'

const tempDirs: string[] = []
const defaultSignedUrlTtlSeconds = '300'
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])
const pngChecksum = createHash('sha256').update(pngBytes).digest('hex')
const cfbfSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const legacyOfficeCases = [
  {
    clsid: [
      0x06, 0x09, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x46,
    ],
    extension: 'doc',
    mimeType: 'application/msword',
    originalName: 'document.doc',
  },
  {
    clsid: [
      0x20, 0x08, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x46,
    ],
    extension: 'xls',
    mimeType: 'application/vnd.ms-excel',
    originalName: 'workbook.xls',
  },
  {
    clsid: [
      0x10, 0x8d, 0x81, 0x64, 0x9b, 0x4f, 0xcf, 0x11, 0x86, 0xea, 0x00, 0xaa, 0x00, 0xb9, 0x29,
      0xe8,
    ],
    extension: 'ppt',
    mimeType: 'application/vnd.ms-powerpoint',
    originalName: 'slides.ppt',
  },
] as const

function createLegacyOfficeBytes(clsid: readonly number[]) {
  const bytes = new Uint8Array(608)

  bytes.set(cfbfSignature, 0)
  bytes[30] = 9
  bytes.set(clsid, 592)

  return bytes
}

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

async function* streamFromBytes(bytes: Uint8Array) {
  yield bytes
}

function createUploadInput(
  userId: string,
  originalName = 'avatar.png',
): {
  body: AsyncIterable<Uint8Array>
  originalName: string
  usage: AttachmentUsage
  userId: string
} {
  return {
    body: streamFromBytes(pngBytes),
    originalName,
    usage: ATTACHMENT_USAGE_AVATAR,
    userId,
  }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('attachment service', () => {
  async function createAttachmentServiceForTest(
    database: Awaited<ReturnType<typeof createTestDb>>,
    options: { signedUrlTtlSeconds?: string } = {},
  ) {
    const root = await createTempRoot()

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T00:00:00.000Z'))
    vi.stubEnv('ATTACHMENT_STORAGE_DIR', root)
    vi.stubEnv('ATTACHMENT_SIGNING_SECRET', 'test-secret')
    vi.stubEnv(
      'ATTACHMENT_SIGNED_URL_TTL_SECONDS',
      options.signedUrlTtlSeconds ?? defaultSignedUrlTtlSeconds,
    )

    return createAttachmentService(database)
  }

  it('uploads files, stores metadata, and creates signed URLs', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    const attachment = await service.upload(createUploadInput(userId))

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
    })

    expect(signed.url).toMatch(new RegExp(`^/api/attachments/${attachment.id}/content\\?token=`))
    expect(signed.expiresAt).toBe('2026-05-29T00:05:00.000Z')
  })

  it('uploads legacy Office CFBF files', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    for (const item of legacyOfficeCases) {
      const bytes = createLegacyOfficeBytes(item.clsid)
      const attachment = await service.upload({
        body: streamFromBytes(bytes),
        originalName: item.originalName,
        usage: ATTACHMENT_USAGE_AVATAR,
        userId,
      })

      expect(attachment).toMatchObject({
        extension: item.extension,
        mimeType: item.mimeType,
        originalName: item.originalName,
        size: bytes.byteLength,
      })
    }
  })

  it('reads metadata, creates signed URLs, and deletes attachments without user access checks', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await service.upload(createUploadInput(userId))

    await expect(service.get(attachment.id)).resolves.toMatchObject({
      id: attachment.id,
      originalName: 'avatar.png',
    })
    await expect(
      service.createSignedUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).resolves.toMatchObject({
      expiresAt: '2026-05-29T00:05:00.000Z',
    })

    const [activeRow] = await database.select().from(attachments)
    expect(activeRow?.deletedAt).toBeNull()

    await expect(service.delete(attachment.id)).resolves.toBeUndefined()
  })

  it('does not sign deleted attachments', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await service.upload(createUploadInput(userId))

    await service.delete(attachment.id)

    await expect(
      service.createSignedUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError)
  })

  it('reads stored content with signed token and response headers', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await service.upload(createUploadInput(userId))
    const signed = await service.createSignedUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
    const token = new URL(signed.url, 'http://localhost').searchParams.get('token')

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

  it('does not cache signed content beyond the token lifetime', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database, { signedUrlTtlSeconds: '60' })
    const userId = await createUser(database)
    const attachment = await service.upload(createUploadInput(userId))
    const signed = await service.createSignedUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
    const token = new URL(signed.url, 'http://localhost').searchParams.get('token')

    expect(token).toBeTruthy()

    const content = await service.readContent(attachment.id, token!)

    expect(content.headers['Cache-Control']).toBe('private, max-age=60')
  })

  it('rejects old signed token after attachment delete', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await service.upload(createUploadInput(userId))
    const signed = await service.createSignedUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
    const token = new URL(signed.url, 'http://localhost').searchParams.get('token')

    expect(token).toBeTruthy()

    await service.delete(attachment.id)

    await expect(service.readContent(attachment.id, token!)).rejects.toBeInstanceOf(
      AttachmentNotFoundError,
    )
  })

  it('rejects streams above the global upload size without creating metadata', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    async function* oversizedPngStream() {
      yield pngBytes
      yield new Uint8Array(ATTACHMENT_MAX_SIZE_BYTES - pngBytes.byteLength + 1)
    }

    await expect(
      service.upload({
        body: oversizedPngStream(),
        originalName: 'avatar.png',
        usage: ATTACHMENT_USAGE_AVATAR,
        userId,
      }),
    ).rejects.toBeInstanceOf(AttachmentFileTooLargeError)

    await expect(database.select().from(attachments)).resolves.toEqual([])
  })
})
