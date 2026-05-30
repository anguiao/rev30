import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
} from '@rev30/contracts'
import {
  AttachmentFileTooLargeError,
  AttachmentNotFoundError,
  AttachmentSignedUrlInvalidError,
  AttachmentTypeUnsupportedError,
} from '../../../src/modules/attachments/errors'
import { ATTACHMENT_MAX_SIZE_MESSAGE } from '../../../src/modules/attachments/policy'
import {
  createAttachmentContentRoutes,
  createAttachmentRoutes,
} from '../../../src/modules/attachments/routes'

const attachmentId = '11111111-1111-4111-8111-111111111111'
const currentUser = {
  id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
  username: 'ada',
  nickname: 'Ada Lovelace',
  email: null,
  phone: null,
  status: 1,
  departments: [],
  roles: [],
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-06T00:00:00.000Z',
}

const attachment = {
  id: attachmentId,
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 16,
  usage: ATTACHMENT_USAGE_AVATAR,
  createdAt: '2026-05-29T00:00:00.000Z',
}

const signedUrl = {
  url: `/api/attachments/${attachmentId}/content?token=signed-token`,
  expiresAt: '2026-05-29T00:05:00.000Z',
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

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
    createSignedUrl: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    readContent: vi.fn(),
    upload: vi.fn(),
  }
  const authMiddleware = vi.fn(async (c: Context, next: Next) => {
    const context = c as unknown as { set: (key: string, value: unknown) => void }

    context.set('currentUser', currentUser)
    context.set('accessCodes', authState.accessCodes)
    context.set('isAdmin', authState.isAdmin)

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

function createAttachmentTestApp() {
  return new Hono()
    .use('*', mocks.authMiddleware)
    .route('/api/attachments', createAttachmentRoutes({} as never))
}

function createAttachmentContentTestApp() {
  return new Hono().route('/api/attachments', createAttachmentContentRoutes({} as never))
}

describe('attachment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authState.accessCodes = []
    mocks.authState.isAdmin = false
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.createAttachmentService.mockReturnValue(mocks.service)
    mocks.service.upload.mockImplementation(async (input: { body: AsyncIterable<Uint8Array> }) => {
      await readStreamBytes(input.body)

      return attachment
    })
    mocks.service.list.mockResolvedValue({
      list: [
        {
          ...attachment,
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
    mocks.service.createSignedUrl.mockResolvedValue(signedUrl)
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

  it('uploads multipart files and delegates metadata routes to the attachment service', async () => {
    mocks.authState.accessCodes = ['content:attachment:list', 'content:attachment:delete']
    const app = createAttachmentTestApp()
    const form = new FormData()
    const file = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', {
      type: 'image/png',
    })

    form.set('file', file)

    const uploadResponse = await app.request(`/api/attachments?usage=${ATTACHMENT_USAGE_AVATAR}`, {
      method: 'POST',
      body: form,
    })
    expect(uploadResponse.status).toBe(201)
    expect(await uploadResponse.json()).toEqual(attachment)
    expect(mocks.service.upload).toHaveBeenCalledWith({
      body: expect.any(Object),
      originalName: 'avatar.png',
      usage: ATTACHMENT_USAGE_AVATAR,
      userId: currentUser.id,
    })

    const detailResponse = await app.request(`/api/attachments/${attachmentId}`)
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual(attachment)
    expect(mocks.service.get).toHaveBeenCalledWith(attachmentId)

    const signedUrlResponse = await app.request(`/api/attachments/${attachmentId}/signed-url`, {
      method: 'POST',
      body: JSON.stringify({
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(signedUrlResponse.status).toBe(200)
    expect(await signedUrlResponse.json()).toEqual(signedUrl)
    expect(mocks.service.createSignedUrl).toHaveBeenCalledWith(attachmentId, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })

    const deleteResponse = await app.request(`/api/attachments/${attachmentId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(attachmentId)
  })

  it('requires attachment management access for metadata and manual deletion', async () => {
    const app = createAttachmentTestApp()

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

    const signedUrlResponse = await app.request(`/api/attachments/${attachmentId}/signed-url`, {
      method: 'POST',
      body: JSON.stringify({
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    expect(signedUrlResponse.status).toBe(200)
    expect(mocks.service.createSignedUrl).toHaveBeenCalledWith(attachmentId, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
  })

  it('lists attachments with filters and requires list access', async () => {
    const app = createAttachmentTestApp()

    const forbiddenResponse = await app.request('/api/attachments')
    expect(forbiddenResponse.status).toBe(403)
    expect(mocks.service.list).not.toHaveBeenCalled()

    mocks.authState.accessCodes = ['content:attachment:list']
    const response = await app.request(
      `/api/attachments?page=2&pageSize=5&usage=${ATTACHMENT_USAGE_AVATAR}&keyword=avatar`,
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
      usage: ATTACHMENT_USAGE_AVATAR,
      keyword: 'avatar',
    })
  })

  it('streams signed content without authentication middleware', async () => {
    const app = createAttachmentContentTestApp()

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
    expect(mocks.service.readContent).toHaveBeenCalledWith(attachmentId, 'signed-token')
  })

  it('validates multipart form, request bodies, ids, and signed tokens before service calls', async () => {
    const app = createAttachmentTestApp()
    const contentApp = createAttachmentContentTestApp()

    const missingFileForm = new FormData()
    const missingFileResponse = await app.request(
      `/api/attachments?usage=${ATTACHMENT_USAGE_AVATAR}`,
      {
        method: 'POST',
        body: missingFileForm,
      },
    )
    expect(missingFileResponse.status).toBe(400)
    expect(await missingFileResponse.json()).toEqual({
      message: '请选择文件',
    })
    expect(mocks.service.upload).not.toHaveBeenCalled()

    const invalidUsageForm = new FormData()
    invalidUsageForm.set(
      'file',
      new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', {
        type: 'image/png',
      }),
    )
    const invalidUsageResponse = await app.request('/api/attachments?usage=bad-usage', {
      method: 'POST',
      body: invalidUsageForm,
    })
    expect(invalidUsageResponse.status).toBe(400)
    expect(await invalidUsageResponse.json()).toEqual({
      message: '上传用途无效',
    })
    expect(mocks.service.upload).not.toHaveBeenCalled()

    mocks.authState.accessCodes = ['content:attachment:list']
    const invalidIdResponse = await app.request('/api/attachments/not-a-uuid')
    expect(invalidIdResponse.status).toBe(400)
    expect(await invalidIdResponse.json()).toEqual({ message: '附件 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const invalidBodyResponse = await app.request(`/api/attachments/${attachmentId}/signed-url`, {
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
    expect(mocks.service.createSignedUrl).not.toHaveBeenCalled()

    const missingTokenResponse = await contentApp.request(
      `/api/attachments/${attachmentId}/content`,
    )
    expect(missingTokenResponse.status).toBe(400)
    expect(await missingTokenResponse.json()).toEqual({
      message: '附件链接已失效',
    })
    expect(mocks.service.readContent).not.toHaveBeenCalled()
  })

  it('maps attachment domain errors to route responses', async () => {
    mocks.authState.accessCodes = ['content:attachment:list']
    const app = createAttachmentTestApp()
    const contentApp = createAttachmentContentTestApp()
    const form = new FormData()

    form.set(
      'file',
      new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', {
        type: 'image/png',
      }),
    )

    mocks.service.upload.mockRejectedValueOnce(
      new AttachmentFileTooLargeError(ATTACHMENT_MAX_SIZE_MESSAGE),
    )
    const tooLargeResponse = await app.request(
      `/api/attachments?usage=${ATTACHMENT_USAGE_GENERAL}`,
      {
        method: 'POST',
        body: form,
      },
    )
    expect(tooLargeResponse.status).toBe(400)
    expect(await readJson(tooLargeResponse)).toEqual({
      message: ATTACHMENT_MAX_SIZE_MESSAGE,
    })

    mocks.service.upload.mockRejectedValueOnce(new AttachmentTypeUnsupportedError())
    const unsupportedTypeResponse = await app.request(
      `/api/attachments?usage=${ATTACHMENT_USAGE_GENERAL}`,
      {
        method: 'POST',
        body: form,
      },
    )
    expect(unsupportedTypeResponse.status).toBe(400)
    expect(await readJson(unsupportedTypeResponse)).toEqual({
      message: '不支持的文件类型',
    })

    mocks.service.get.mockRejectedValueOnce(new AttachmentNotFoundError())
    const notFoundResponse = await app.request(`/api/attachments/${attachmentId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await readJson(notFoundResponse)).toEqual({ message: '附件不存在' })

    mocks.service.readContent.mockRejectedValueOnce(new AttachmentSignedUrlInvalidError())
    const invalidSignedTokenResponse = await contentApp.request(
      `/api/attachments/${attachmentId}/content?token=expired-token`,
    )
    expect(invalidSignedTokenResponse.status).toBe(403)
    expect(await readJson(invalidSignedTokenResponse)).toEqual({
      message: '附件链接已失效',
    })

    mocks.service.readContent.mockRejectedValueOnce(new AttachmentNotFoundError())
    const contentNotFoundResponse = await contentApp.request(
      `/api/attachments/${attachmentId}/content?token=signed-token`,
    )
    expect(contentNotFoundResponse.status).toBe(404)
    expect(await readJson(contentNotFoundResponse)).toEqual({ message: '附件不存在' })
  })
})
