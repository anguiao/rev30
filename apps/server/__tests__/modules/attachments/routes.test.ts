import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  type Attachment,
  type AttachmentContentUrl,
  type User,
} from '@rev30/contracts'
import {
  AttachmentContentUnauthorizedError,
  AttachmentFileTooLargeError,
  AttachmentNotFoundError,
  AttachmentContentUrlInvalidError,
  AttachmentContentUrlUnsupportedError,
  AttachmentTypeUnsupportedError,
  AttachmentUploadSessionInvalidError,
  AttachmentUploadSessionNotReadyError,
  AttachmentUploadUrlInvalidError,
} from '../../../src/modules/attachments/errors'
import { ATTACHMENT_MAX_SIZE_MESSAGE } from '../../../src/modules/attachments/policy'
import type { createAttachmentService } from '../../../src/modules/attachments/service'
import type { AuthEnv } from '../../../src/middleware/auth'
import { createOperationLogMiddleware } from '../../../src/middleware/operation-log'
import { createAttachmentRoutes } from '../../../src/modules/attachments/routes'
import type { RequestContextEnv } from '../../../src/middleware/request-context'
import { createLogger } from '../../../src/runtime/logger'
import type { OperationLogEvent } from '../../../src/runtime/operation-log'

type AttachmentService = ReturnType<typeof createAttachmentService>

const attachmentId = 'a1111111-1111-4111-8111-11111111111a'
const uploadId = 'b1111111-1111-4111-8111-11111111111b'
const currentUser = {
  id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
  username: 'ada',
  nickname: 'Ada Lovelace',
  avatarId: null,
  builtIn: false,
  email: null,
  phone: null,
  status: 1,
  departments: [],
  roles: [],
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-06T00:00:00.000Z',
} satisfies User

const attachment = {
  id: attachmentId,
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 16,
  usage: 'avatar',
  readPolicy: 'signed',
  createdAt: '2026-05-29T00:00:00.000Z',
} satisfies Attachment

const contentUrl = {
  request: {
    url: `/api/attachments/${attachmentId}/content?token=signed-token`,
    method: 'GET',
    headers: {},
    expiresAt: '2026-05-29T00:05:00.000Z',
  },
} satisfies AttachmentContentUrl

const uploadSession = {
  uploadId,
  request: {
    url: `/api/attachments/uploads/${uploadId}/content?token=upload-token`,
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
    },
    expiresAt: '2026-05-29T00:05:00.000Z',
  },
} satisfies Awaited<ReturnType<AttachmentService['createUploadSession']>>

const requestLogger = createLogger({ level: 'silent' })

async function readStreamBytes(body: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = []

  for await (const chunk of body) {
    chunks.push(chunk)
  }

  return new Uint8Array(await new Blob(chunks).arrayBuffer())
}

const mocks = vi.hoisted(() => {
  const authState = {
    accessCodes: [] as string[],
    isAdmin: false,
  }
  const service = {
    completeUploadSession: vi.fn<AttachmentService['completeUploadSession']>(),
    createContentUrl: vi.fn<AttachmentService['createContentUrl']>(),
    createUploadSession: vi.fn<AttachmentService['createUploadSession']>(),
    delete: vi.fn<AttachmentService['delete']>(),
    get: vi.fn<AttachmentService['get']>(),
    list: vi.fn<AttachmentService['list']>(),
    readContent: vi.fn<AttachmentService['readContent']>(),
    uploadSessionContent: vi.fn<AttachmentService['uploadSessionContent']>(),
  }
  const authMiddleware = vi.fn(async (c: Context<AuthEnv>, next: Next) => {
    c.set('currentUser', currentUser)
    c.set('currentSessionId', '00000000-0000-4000-8000-000000000002')
    c.set('accessCodes', authState.accessCodes)
    c.set('isAdmin', authState.isAdmin)

    await next()
  })

  return {
    authState,
    authMiddleware,
    createAttachmentService: vi.fn(() => service),
    service,
  }
})

vi.mock('../../../src/modules/attachments/service', () => ({
  createAttachmentService: mocks.createAttachmentService,
}))

function createAttachmentTestApp(events: OperationLogEvent[] = []) {
  return new Hono<RequestContextEnv>()
    .use('*', async (c, next) => {
      c.set('requestContext', {
        clientIp: null,
        clientIpSource: 'unavailable',
        logger: requestLogger,
        requestId: '11111111-1111-4111-8111-111111111111',
        userAgent: null,
      })

      await next()
    })
    .use(
      '*',
      createOperationLogMiddleware((event) => {
        events.push(event)
      }, requestLogger),
    )
    .route('/api/attachments', createAttachmentRoutes({} as never, mocks.authMiddleware))
}

describe('attachment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authState.accessCodes = []
    mocks.authState.isAdmin = false
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.createAttachmentService.mockReturnValue(mocks.service)
    mocks.service.createUploadSession.mockResolvedValue(uploadSession)
    mocks.service.uploadSessionContent.mockImplementation(async ({ body }) => {
      assert(body, 'Expected an upload body')
      await readStreamBytes(body)
    })
    mocks.service.completeUploadSession.mockResolvedValue(attachment)
    mocks.service.list.mockResolvedValue({
      list: [
        {
          ...attachment,
          references: [],
          createdBy: {
            id: currentUser.id,
            username: currentUser.username,
            nickname: currentUser.nickname,
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    mocks.service.get.mockResolvedValue(attachment)
    mocks.service.createContentUrl.mockResolvedValue(contentUrl)
    mocks.service.delete.mockResolvedValue(undefined)
    mocks.service.readContent.mockResolvedValue({
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))
          controller.close()
        },
      }),
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'inline; filename="avatar.png"',
        'Content-Length': '4',
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })

  it('creates upload sessions with policy defaults for the current user', async () => {
    const app = createAttachmentTestApp()

    const sessionResponse = await app.request('/api/attachments/uploads', {
      method: 'POST',
      body: JSON.stringify({
        originalName: 'avatar.png',
        usage: 'avatar',
        size: 4,
        contentType: 'image/png',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(sessionResponse.status).toBe(201)
    expect(await sessionResponse.json()).toEqual(uploadSession)
    expect(mocks.service.createUploadSession).toHaveBeenCalledWith({
      originalName: 'avatar.png',
      usage: 'avatar',
      readPolicy: 'signed',
      cleanupPolicy: 'manual',
      size: 4,
      contentType: 'image/png',
      userId: currentUser.id,
    })
  })

  it('normalizes upload IDs and streams content without authentication middleware', async () => {
    const file = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', {
      type: 'image/png',
    })
    const app = createAttachmentTestApp()

    const uploadResponse = await app.request(
      `/api/attachments/uploads/${uploadId.toUpperCase()}/content?token=upload-token`,
      {
        method: 'PUT',
        body: file,
      },
    )
    expect(uploadResponse.status).toBe(204)
    expect(mocks.authMiddleware).not.toHaveBeenCalled()
    expect(mocks.service.uploadSessionContent).toHaveBeenCalledWith({
      body: expect.any(Object),
      token: 'upload-token',
      uploadId,
    })
  })

  it('normalizes the upload session ID and uses it as the completion audit target', async () => {
    const events: OperationLogEvent[] = []
    const app = createAttachmentTestApp(events)

    const completeResponse = await app.request(
      `/api/attachments/uploads/${uploadId.toUpperCase()}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'content-type': 'application/json',
        },
      },
    )
    expect(completeResponse.status).toBe(201)
    expect(await completeResponse.json()).toEqual(attachment)
    expect(mocks.service.completeUploadSession).toHaveBeenCalledWith({
      uploadId,
      userId: currentUser.id,
    })
    expect(events).toMatchObject([
      {
        action: 'content:attachment:upload',
        targetKey: uploadId,
        targetLabel: null,
        httpStatus: 201,
        result: 'success',
      },
    ])
  })

  it('returns attachment metadata for callers with management access', async () => {
    mocks.authState.accessCodes = ['content:attachment:list']
    const app = createAttachmentTestApp()

    const detailResponse = await app.request(`/api/attachments/${attachmentId}`)
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual(attachment)
    expect(mocks.service.get).toHaveBeenCalledWith(attachmentId)
  })

  it('creates signed content URLs for authenticated callers', async () => {
    const app = createAttachmentTestApp()

    const contentUrlResponse = await app.request(`/api/attachments/${attachmentId}/content-url`, {
      method: 'POST',
      body: JSON.stringify({
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(contentUrlResponse.status).toBe(200)
    expect(await contentUrlResponse.json()).toEqual(contentUrl)
    expect(mocks.service.createContentUrl).toHaveBeenCalledWith(attachmentId, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
  })

  it('records successful manual attachment deletion', async () => {
    mocks.authState.accessCodes = ['content:attachment:delete']
    const events: OperationLogEvent[] = []
    const app = createAttachmentTestApp(events)

    const deleteResponse = await app.request(`/api/attachments/${attachmentId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(attachmentId, requestLogger)
    expect(events).toMatchObject([
      {
        action: 'content:attachment:delete',
        targetKey: attachmentId,
        targetLabel: null,
        httpStatus: 204,
        result: 'success',
      },
    ])
  })

  it('requires attachment management access for metadata and manual deletion', async () => {
    const events: OperationLogEvent[] = []
    const app = createAttachmentTestApp(events)

    const detailResponse = await app.request(`/api/attachments/${attachmentId}`)
    expect(detailResponse.status).toBe(403)
    expect(await detailResponse.json()).toEqual({ message: '无权访问' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const deleteResponse = await app.request(`/api/attachments/${attachmentId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(403)
    expect(await deleteResponse.json()).toEqual({ message: '无权访问' })
    expect(mocks.service.delete).not.toHaveBeenCalled()

    const contentUrlResponse = await app.request(`/api/attachments/${attachmentId}/content-url`, {
      method: 'POST',
      body: JSON.stringify({
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(contentUrlResponse.status).toBe(200)
    expect(mocks.service.createContentUrl).toHaveBeenCalledWith(attachmentId, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
    expect(events).toEqual([])
  })

  it('lists attachments with filters and requires list access', async () => {
    const app = createAttachmentTestApp()

    const forbiddenResponse = await app.request('/api/attachments')
    expect(forbiddenResponse.status).toBe(403)
    expect(mocks.service.list).not.toHaveBeenCalled()

    mocks.authState.accessCodes = ['content:attachment:list']
    const response = await app.request(
      '/api/attachments?page=2&pageSize=5&usage=avatar&keyword=avatar',
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
    })
    expect(mocks.service.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      usage: 'avatar',
      keyword: 'avatar',
    })
  })

  it('streams content without authentication middleware', async () => {
    const app = createAttachmentTestApp()

    const response = await app.request(
      `/api/attachments/${attachmentId}/content?token=signed-token`,
    )
    const body = new Uint8Array(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(body).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-disposition')).toBe('inline; filename="avatar.png"')
    expect(response.headers.get('content-length')).toBe('4')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(mocks.authMiddleware).not.toHaveBeenCalled()
    expect(mocks.service.readContent).toHaveBeenCalledWith(
      attachmentId,
      expect.objectContaining({
        signedToken: 'signed-token',
        attachmentReadToken: undefined,
      }),
    )
  })

  it('passes optional signed and authenticated read credentials to content reads', async () => {
    const app = createAttachmentTestApp()

    const response = await app.request(`/api/attachments/${attachmentId}/content`, {
      headers: {
        cookie: 'attachment_token=attachment-cookie-token',
      },
    })

    expect(response.status).toBe(200)
    expect(mocks.service.readContent).toHaveBeenCalledWith(
      attachmentId,
      expect.objectContaining({
        signedToken: undefined,
        attachmentReadToken: 'attachment-cookie-token',
      }),
    )
  })

  it('passes blank content tokens through for policy-driven reads', async () => {
    const app = createAttachmentTestApp()

    const response = await app.request(`/api/attachments/${attachmentId}/content?token=`, {
      headers: {
        cookie: 'attachment_token=attachment-cookie-token',
      },
    })

    expect(response.status).toBe(200)
    expect(mocks.service.readContent).toHaveBeenCalledWith(
      attachmentId,
      expect.objectContaining({
        signedToken: '',
        attachmentReadToken: 'attachment-cookie-token',
      }),
    )
  })

  it('validates upload sessions, request bodies, ids, and upload tokens before service calls', async () => {
    const events: OperationLogEvent[] = []
    const app = createAttachmentTestApp(events)

    const invalidCreateResponse = await app.request('/api/attachments/uploads', {
      method: 'POST',
      body: JSON.stringify({
        originalName: 'avatar.png',
        usage: 'avatar',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(invalidCreateResponse.status).toBe(400)
    expect(await invalidCreateResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.createUploadSession).not.toHaveBeenCalled()

    const invalidCompleteResponse = await app.request(
      '/api/attachments/uploads/not-a-uuid/complete',
      {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'content-type': 'application/json',
        },
      },
    )
    expect(invalidCompleteResponse.status).toBe(400)
    expect(await invalidCompleteResponse.json()).toEqual({ message: '上传会话 ID 无效' })
    expect(mocks.service.completeUploadSession).not.toHaveBeenCalled()

    const invalidCompleteBodyResponse = await app.request(
      `/api/attachments/uploads/${uploadId}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({ originalName: 'avatar.png' }),
        headers: { 'content-type': 'application/json' },
      },
    )
    expect(invalidCompleteBodyResponse.status).toBe(400)
    expect(await invalidCompleteBodyResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.completeUploadSession).not.toHaveBeenCalled()

    mocks.authState.accessCodes = ['content:attachment:list']
    const invalidIdResponse = await app.request('/api/attachments/not-a-uuid')
    expect(invalidIdResponse.status).toBe(400)
    expect(await invalidIdResponse.json()).toEqual({ message: '附件 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const invalidBodyResponse = await app.request(`/api/attachments/${attachmentId}/content-url`, {
      method: 'POST',
      body: JSON.stringify({
        disposition: 'bad',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(invalidBodyResponse.status).toBe(400)
    expect(await invalidBodyResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.createContentUrl).not.toHaveBeenCalled()

    const missingUploadTokenResponse = await app.request(
      `/api/attachments/uploads/${uploadId}/content`,
      {
        method: 'PUT',
        body: new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', {
          type: 'image/png',
        }),
      },
    )
    expect(missingUploadTokenResponse.status).toBe(400)
    expect(await missingUploadTokenResponse.json()).toEqual({
      message: '附件链接已失效',
    })
    expect(mocks.service.uploadSessionContent).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('maps unsupported signed URL requests for authenticated attachments', async () => {
    mocks.authState.accessCodes = ['content:attachment:list']
    const app = createAttachmentTestApp()
    mocks.service.createContentUrl.mockRejectedValueOnce(new AttachmentContentUrlUnsupportedError())

    const response = await app.request(`/api/attachments/${attachmentId}/content-url`, {
      method: 'POST',
      body: JSON.stringify({ disposition: ATTACHMENT_DISPOSITION_INLINE }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '附件不支持短期读取链接' })
  })

  it('maps unauthorized authenticated content reads to 401', async () => {
    const app = createAttachmentTestApp()
    mocks.service.readContent.mockRejectedValueOnce(new AttachmentContentUnauthorizedError())

    const response = await app.request(`/api/attachments/${attachmentId}/content`)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  it.each([
    {
      name: 'oversized files during upload creation',
      serviceMethod: 'createUploadSession',
      error: new AttachmentFileTooLargeError(ATTACHMENT_MAX_SIZE_MESSAGE),
      path: '/api/attachments/uploads',
      request: {
        method: 'POST',
        body: JSON.stringify({ originalName: 'avatar.png', usage: 'general', size: 4 }),
        headers: { 'content-type': 'application/json' },
      },
      status: 400,
      message: ATTACHMENT_MAX_SIZE_MESSAGE,
    },
    {
      name: 'unsupported types during content upload',
      serviceMethod: 'uploadSessionContent',
      error: new AttachmentTypeUnsupportedError(),
      path: `/api/attachments/uploads/${uploadId}/content?token=upload-token`,
      request: {
        method: 'PUT',
        body: new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', {
          type: 'image/png',
        }),
      },
      status: 400,
      message: '不支持的文件类型',
    },
    {
      name: 'expired links during content upload',
      serviceMethod: 'uploadSessionContent',
      error: new AttachmentUploadUrlInvalidError(),
      path: `/api/attachments/uploads/${uploadId}/content?token=expired-token`,
      request: {
        method: 'PUT',
        body: new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', {
          type: 'image/png',
        }),
      },
      status: 403,
      message: '上传链接已失效',
    },
    {
      name: 'missing content during upload completion',
      serviceMethod: 'completeUploadSession',
      error: new AttachmentUploadSessionNotReadyError(),
      path: `/api/attachments/uploads/${uploadId}/complete`,
      request: {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      },
      status: 400,
      message: '文件尚未上传',
    },
    {
      name: 'expired sessions during upload completion',
      serviceMethod: 'completeUploadSession',
      error: new AttachmentUploadSessionInvalidError(),
      path: `/api/attachments/uploads/${uploadId}/complete`,
      request: {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      },
      status: 400,
      message: '上传会话已失效',
    },
    {
      name: 'missing attachments during metadata reads',
      serviceMethod: 'get',
      error: new AttachmentNotFoundError(),
      path: `/api/attachments/${attachmentId}`,
      request: { method: 'GET' },
      status: 404,
      message: '附件不存在',
    },
    {
      name: 'invalid signed tokens during content reads',
      serviceMethod: 'readContent',
      error: new AttachmentContentUrlInvalidError(),
      path: `/api/attachments/${attachmentId}/content?token=expired-token`,
      request: { method: 'GET' },
      status: 401,
      message: '附件链接已失效',
    },
    {
      name: 'missing attachments during content reads',
      serviceMethod: 'readContent',
      error: new AttachmentNotFoundError(),
      path: `/api/attachments/${attachmentId}/content?token=signed-token`,
      request: { method: 'GET' },
      status: 404,
      message: '附件不存在',
    },
  ] as const)(
    'maps $name to the expected HTTP response',
    async ({ serviceMethod, error, path, request, status, message }) => {
      if (serviceMethod === 'get') mocks.authState.accessCodes = ['content:attachment:list']
      const events: OperationLogEvent[] = []
      const app = createAttachmentTestApp(events)
      const service = mocks.service[serviceMethod]
      service.mockRejectedValueOnce(error)

      const response = await app.request(path, request)

      expect(service).toHaveBeenCalledOnce()
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ message })
      expect(events).toMatchObject(
        serviceMethod === 'completeUploadSession'
          ? [
              {
                action: 'content:attachment:upload',
                targetKey: uploadId,
                targetLabel: null,
                httpStatus: 400,
                result: 'failure',
              },
            ]
          : [],
      )
    },
  )
})
