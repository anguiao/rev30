import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ATTACHMENT_READ_POLICY_SIGNED,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import { attachments, systemUsers } from '../../../src/db/schema'
import {
  AttachmentContentUnauthorizedError,
  AttachmentContentUrlInvalidError,
  AttachmentContentUrlUnsupportedError,
  AttachmentFileTooLargeError,
  AttachmentNotFoundError,
  AttachmentTypeUnsupportedError,
  AttachmentUploadSessionInvalidError,
  AttachmentUploadSessionNotReadyError,
} from '../../../src/modules/attachments/errors'
import { ATTACHMENT_MAX_SIZE_BYTES } from '../../../src/modules/attachments/policy'
import { createAttachmentService } from '../../../src/modules/attachments/service'
import { createTestDb } from '../../helpers/db'

const tempDirs: string[] = []
const defaultContentUrlTtlSeconds = '300'
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])
const pngChecksum = createHash('sha256').update(pngBytes).digest('hex')
const jpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
])
const jpegChecksum = createHash('sha256').update(jpegBytes).digest('hex')
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

function getUploadToken(url: string) {
  const token = new URL(url, 'http://localhost').searchParams.get('token')

  expect(token).toBeTruthy()

  return token!
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
    options: { contentUrlTtlSeconds?: string } = {},
  ) {
    const root = await createTempRoot()

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T00:00:00.000Z'))
    vi.stubEnv('ATTACHMENT_STORAGE_DIR', root)
    vi.stubEnv('ATTACHMENT_SIGNING_SECRET', 'test-secret')
    vi.stubEnv(
      'ATTACHMENT_CONTENT_URL_TTL_SECONDS',
      options.contentUrlTtlSeconds ?? defaultContentUrlTtlSeconds,
    )

    return createAttachmentService(database)
  }

  async function createAttachmentViaSession(
    service: ReturnType<typeof createAttachmentService>,
    input: {
      bytes: Uint8Array
      originalName: string
      userId: string
      usage?: string
      readPolicy?: 'signed' | 'authenticated'
    },
  ) {
    const session = await service.createUploadSession({
      originalName: input.originalName,
      usage: input.usage ?? 'avatar',
      readPolicy: input.readPolicy ?? ATTACHMENT_READ_POLICY_SIGNED,
      size: input.bytes.byteLength,
      userId: input.userId,
    })
    const token = getUploadToken(session.request.url)

    await service.uploadSessionContent({
      body: streamFromBytes(input.bytes),
      token,
      uploadId: session.uploadId,
    })

    return service.completeUploadSession({
      uploadId: session.uploadId,
      userId: input.userId,
    })
  }

  async function createAttachmentWithMissingStorage(
    database: Awaited<ReturnType<typeof createTestDb>>,
    input: {
      readPolicy: 'signed' | 'authenticated'
      userId: string
    },
  ) {
    const id = randomUUID()
    const now = new Date('2026-05-29T00:00:00.000Z')

    await database.insert(attachments).values({
      id,
      storageProvider: 'local',
      storageKey: `missing/${id}.png`,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: pngBytes.byteLength,
      usage: 'avatar',
      readPolicy: input.readPolicy,
      checksum: pngChecksum,
      createdBy: input.userId,
      createdAt: now,
    })

    return id
  }

  it('creates upload sessions, accepts authorized uploads, and completes metadata', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    const session = await service.createUploadSession({
      originalName: 'avatar.png',
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
      size: pngBytes.byteLength,
      contentType: 'image/png',
      userId,
    })
    const token = getUploadToken(session.request.url)

    expect(session).toMatchObject({
      request: {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
        },
        expiresAt: '2026-05-29T00:05:00.000Z',
      },
    })

    await service.uploadSessionContent({
      body: streamFromBytes(pngBytes),
      token,
      uploadId: session.uploadId,
    })

    const attachment = await service.completeUploadSession({
      uploadId: session.uploadId,
      userId,
    })

    expect(attachment).toMatchObject({
      id: session.uploadId,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: pngBytes.byteLength,
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
    })

    const [row] = await database.select().from(attachments)
    expect(row).toMatchObject({
      id: session.uploadId,
      storageProvider: 'local',
      storageKey: `uploads/2026/05/29/${session.uploadId}.png`,
      size: pngBytes.byteLength,
      checksum: pngChecksum,
      createdBy: userId,
    })
  })

  it('rejects completing missing or expired upload sessions', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const session = await service.createUploadSession({
      originalName: 'avatar.png',
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
      size: pngBytes.byteLength,
      userId,
    })

    await expect(
      service.completeUploadSession({
        uploadId: session.uploadId,
        userId,
      }),
    ).rejects.toBeInstanceOf(AttachmentUploadSessionNotReadyError)

    vi.setSystemTime(new Date('2026-05-29T00:05:00.000Z'))

    await expect(
      service.completeUploadSession({
        uploadId: session.uploadId,
        userId,
      }),
    ).rejects.toBeInstanceOf(AttachmentUploadSessionInvalidError)
  })

  it('preserves compatible filename extensions when detected MIME matches', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    const attachment = await createAttachmentViaSession(service, {
      bytes: jpegBytes,
      originalName: 'avatar.JPEG',
      userId,
    })

    expect(attachment).toMatchObject({
      originalName: 'avatar.JPEG',
      mimeType: 'image/jpeg',
      extension: 'jpeg',
      size: jpegBytes.byteLength,
    })

    const [row] = await database.select().from(attachments)
    expect(row).toMatchObject({
      id: attachment.id,
      storageKey: `uploads/2026/05/29/${attachment.id}.jpeg`,
      checksum: jpegChecksum,
    })
  })

  it('rejects uploads whose detected MIME does not match the filename extension', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const session = await service.createUploadSession({
      originalName: 'avatar.png',
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
      size: jpegBytes.byteLength,
      userId,
    })
    const token = getUploadToken(session.request.url)

    await expect(
      service.uploadSessionContent({
        body: streamFromBytes(jpegBytes),
        token,
        uploadId: session.uploadId,
      }),
    ).rejects.toBeInstanceOf(AttachmentTypeUnsupportedError)

    await expect(database.select().from(attachments)).resolves.toEqual([])
  })

  it('stores metadata and creates content URLs after upload sessions complete', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
    })

    expect(attachment).toMatchObject({
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: pngBytes.byteLength,
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
    })

    const [row] = await database.select().from(attachments)
    expect(row).toMatchObject({
      id: attachment.id,
      storageProvider: 'local',
      storageKey: `uploads/2026/05/29/${attachment.id}.png`,
      size: pngBytes.byteLength,
      checksum: pngChecksum,
      createdBy: userId,
    })

    const access = await service.createContentUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })

    expect(access.request).toMatchObject({
      method: 'GET',
      headers: {},
      expiresAt: '2026-05-29T00:05:00.000Z',
    })
    expect(access.request.url).toMatch(
      new RegExp(`^/api/attachments/${attachment.id}/content\\?token=`),
    )
  })

  it('stores authenticated read policy from upload sessions', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    expect(attachment).toMatchObject({
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    const [row] = await database.select().from(attachments)
    expect(row).toMatchObject({
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })
  })

  it('rejects signed URL creation for authenticated attachments', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    await expect(
      service.createContentUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).rejects.toBeInstanceOf(AttachmentContentUrlUnsupportedError)
  })

  it('reads authenticated content with a verified attachment-token user', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    const content = await service.readContent(attachment.id, {
      signedToken: 'stale-signed-token',
      verifyAuthenticatedRead: async () => ({ userId }),
    })

    expect(await streamToBytes(content.body)).toEqual(pngBytes)
    expect(content.headers).toMatchObject({
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline; filename="avatar.png"',
    })
  })

  it('rejects authenticated content without a verified attachment token', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    await expect(
      service.readContent(attachment.id, {
        verifyAuthenticatedRead: async () => {
          throw new AttachmentContentUnauthorizedError()
        },
      }),
    ).rejects.toBeInstanceOf(AttachmentContentUnauthorizedError)
  })

  it('rejects signed content without a token before reading storage', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachmentId = await createAttachmentWithMissingStorage(database, {
      readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
      userId,
    })

    await expect(
      service.readContent(attachmentId, {
        verifyAuthenticatedRead: async () => ({ userId }),
      }),
    ).rejects.toBeInstanceOf(AttachmentContentUrlInvalidError)
  })

  it('rejects unauthorized authenticated content before reading storage', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachmentId = await createAttachmentWithMissingStorage(database, {
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
      userId,
    })

    await expect(
      service.readContent(attachmentId, {
        verifyAuthenticatedRead: async () => {
          throw new AttachmentContentUnauthorizedError()
        },
      }),
    ).rejects.toBeInstanceOf(AttachmentContentUnauthorizedError)
  })

  it('uploads legacy Office CFBF files', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    for (const item of legacyOfficeCases) {
      const bytes = createLegacyOfficeBytes(item.clsid)
      const attachment = await createAttachmentViaSession(service, {
        bytes,
        originalName: item.originalName,
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

  it('reads metadata, creates content URLs, and deletes attachments without user access checks', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
    })

    await expect(service.get(attachment.id)).resolves.toMatchObject({
      id: attachment.id,
      originalName: 'avatar.png',
    })
    await expect(
      service.createContentUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).resolves.toMatchObject({
      request: {
        expiresAt: '2026-05-29T00:05:00.000Z',
      },
    })

    const [activeRow] = await database.select().from(attachments)
    expect(activeRow?.deletedAt).toBeNull()

    await expect(service.delete(attachment.id)).resolves.toBeUndefined()
  })

  it('does not create content URLs for deleted attachments', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
    })

    await service.delete(attachment.id)

    await expect(
      service.createContentUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError)
  })

  it('reads stored content with content token and response headers', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
    })
    const access = await service.createContentUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
    const token = new URL(access.request.url, 'http://localhost').searchParams.get('token')

    expect(token).toBeTruthy()

    const content = await service.readContent(attachment.id, {
      signedToken: token!,
      verifyAuthenticatedRead: async () => ({ userId }),
    })

    expect(await streamToBytes(content.body)).toEqual(pngBytes)
    expect(content.headers).toEqual({
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline; filename="avatar.png"',
      'Content-Length': String(pngBytes.byteLength),
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
    })
  })

  it('does not cache content beyond the token lifetime', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database, { contentUrlTtlSeconds: '60' })
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
    })
    const access = await service.createContentUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
    const token = new URL(access.request.url, 'http://localhost').searchParams.get('token')

    expect(token).toBeTruthy()

    const content = await service.readContent(attachment.id, {
      signedToken: token!,
      verifyAuthenticatedRead: async () => ({ userId }),
    })

    expect(content.headers['Cache-Control']).toBe('private, max-age=60')
  })

  it('rejects old content token after attachment delete', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
    })
    const access = await service.createContentUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
    const token = new URL(access.request.url, 'http://localhost').searchParams.get('token')

    expect(token).toBeTruthy()

    await service.delete(attachment.id)

    await expect(
      service.readContent(attachment.id, {
        signedToken: token!,
        verifyAuthenticatedRead: async () => ({ userId }),
      }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError)
  })

  it('rejects streams above the global upload size without creating metadata', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    async function* oversizedPngStream() {
      yield pngBytes
      yield new Uint8Array(ATTACHMENT_MAX_SIZE_BYTES - pngBytes.byteLength + 1)
    }

    const session = await service.createUploadSession({
      originalName: 'avatar.png',
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
      size: ATTACHMENT_MAX_SIZE_BYTES,
      userId,
    })
    const token = getUploadToken(session.request.url)

    await expect(
      service.uploadSessionContent({
        body: oversizedPngStream(),
        token,
        uploadId: session.uploadId,
      }),
    ).rejects.toBeInstanceOf(AttachmentFileTooLargeError)

    await expect(database.select().from(attachments)).resolves.toEqual([])
  })
})
