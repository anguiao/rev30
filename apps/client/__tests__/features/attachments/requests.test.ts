import { ATTACHMENT_DISPOSITION_INLINE, type Attachment } from '@rev30/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import {
  deleteAttachment,
  getAttachment,
  getAttachmentContentUrl,
  listAttachments,
  resolveSignedAttachmentUrl,
  uploadAttachment,
} from '../../../src/features/attachments'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const attachmentId = '11111111-1111-4111-8111-111111111111'

const attachment: Attachment = {
  id: attachmentId,
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 128,
  usage: 'avatar',
  readPolicy: 'authenticated',
  createdAt: '2026-05-29T00:00:00.000Z',
}

beforeEach(() => {
  createTestPinia()
  useAuthStore().accessToken = 'access-token'
})

describe('attachment request helpers', () => {
  it('uploads files through upload sessions and parses metadata', async () => {
    const fetchMock = createFetchMock(
      jsonResponse(
        {
          uploadId: attachmentId,
          request: {
            url: `/api/attachments/uploads/${attachmentId}/content?token=upload-token`,
            method: 'PUT',
            headers: {
              'Content-Type': 'image/png',
            },
            expiresAt: '2026-05-29T00:05:00.000Z',
          },
        },
        { status: 201 },
      ),
      emptyResponse(),
      jsonResponse(attachment, { status: 201 }),
    )
    const file = new File(['png'], 'avatar.png', { type: 'image/png' })

    const result = await uploadAttachment(file, {
      usage: 'avatar',
      readPolicy: 'authenticated',
    })

    expect(result).toEqual({ id: attachment.id })
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/attachments/uploads',
    })
    expectJsonBody(fetchMock, 0, {
      originalName: 'avatar.png',
      usage: 'avatar',
      readPolicy: 'authenticated',
      size: 3,
      contentType: 'image/png',
    })

    const uploadCall = expectFetchCall(fetchMock, 1, {
      method: 'PUT',
      pathname: `/api/attachments/uploads/${attachmentId}/content`,
      query: {
        token: 'upload-token',
      },
    })
    expect(uploadCall.init.body).toBe(file)
    expect(uploadCall.headers.get('content-type')).toBe('image/png')

    expectFetchCall(fetchMock, 2, {
      method: 'POST',
      pathname: `/api/attachments/uploads/${attachmentId}/complete`,
    })
    expectJsonBody(fetchMock, 2, {})
  })

  it('gets metadata', async () => {
    const fetchMock = createFetchMock(jsonResponse(attachment))

    await expect(getAttachment(attachmentId)).resolves.toEqual(attachment)

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/attachments/${attachmentId}`,
    })
  })

  it('builds stable attachment content URLs', () => {
    expect(getAttachmentContentUrl('11111111-1111-4111-8111-111111111111')).toBe(
      '/api/attachments/11111111-1111-4111-8111-111111111111/content',
    )
  })

  it('resolves signed content URLs for direct use', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        request: {
          url: `/api/attachments/${attachmentId}/content?token=token`,
          method: 'GET',
          headers: {},
          expiresAt: '2026-05-29T00:05:00.000Z',
        },
      }),
    )

    await expect(
      resolveSignedAttachmentUrl(attachmentId, { disposition: ATTACHMENT_DISPOSITION_INLINE }),
    ).resolves.toEqual({
      url: `/api/attachments/${attachmentId}/content?token=token`,
      expiresAt: '2026-05-29T00:05:00.000Z',
    })

    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: `/api/attachments/${attachmentId}/content-url`,
    })
    expectJsonBody(fetchMock, 0, { disposition: ATTACHMENT_DISPOSITION_INLINE })
  })

  it('lists attachment resources with filters', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [
          {
            ...attachment,
            createdBy: {
              id: '22222222-2222-4222-8222-222222222222',
              username: 'ada',
              nickname: 'Ada Lovelace',
            },
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      }),
    )

    await expect(
      listAttachments({
        page: 2,
        pageSize: 10,
        usage: 'avatar',
        keyword: 'avatar',
      }),
    ).resolves.toMatchObject({
      total: 1,
      list: [{ originalName: 'avatar.png' }],
    })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/attachments',
      query: {
        page: '2',
        pageSize: '10',
        usage: 'avatar',
        keyword: 'avatar',
      },
    })
  })

  it('deletes attachments and parses errors', async () => {
    const fetchMock = createFetchMock(
      emptyResponse(),
      jsonResponse({ message: '不支持的文件类型' }, { status: 400 }),
    )
    const expectedError: Partial<ApiRequestError> = {
      message: '不支持的文件类型',
      status: 400,
    }

    await expect(deleteAttachment(attachmentId)).resolves.toBeUndefined()
    await expect(
      uploadAttachment(new File(['bad'], 'bad.svg'), { usage: 'avatar' }),
    ).rejects.toMatchObject(expectedError)

    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/attachments/${attachmentId}`,
    })
    expectFetchCall(fetchMock, 1, {
      method: 'POST',
      pathname: '/api/attachments/uploads',
    })
  })
})
