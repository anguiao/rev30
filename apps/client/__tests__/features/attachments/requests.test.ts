import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  type Attachment,
} from '@rev30/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AttachmentRequestError,
  createAttachmentSignedUrl,
  deleteAttachment,
  getAttachment,
  listAttachments,
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
  usage: ATTACHMENT_USAGE_AVATAR,
  createdAt: '2026-05-29T00:00:00.000Z',
}

beforeEach(() => {
  createTestPinia()
  useAuthStore().accessToken = 'access-token'
})

describe('attachment request helpers', () => {
  it('uploads files with FormData and parses metadata', async () => {
    const fetchMock = createFetchMock(jsonResponse(attachment, { status: 201 }))
    const file = new File(['png'], 'avatar.png', { type: 'image/png' })

    const result = await uploadAttachment(file, { usage: ATTACHMENT_USAGE_AVATAR })

    expect(result).toEqual(attachment)
    const call = expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/attachments',
      query: {
        usage: ATTACHMENT_USAGE_AVATAR,
      },
    })
    expect(call.init.body).toBeInstanceOf(FormData)
    expect((call.init.body as FormData).get('file')).toBe(file)
    expect((call.init.body as FormData).has('usage')).toBe(false)
  })

  it('gets metadata and creates signed URLs', async () => {
    const fetchMock = createFetchMock(
      jsonResponse(attachment),
      jsonResponse({
        url: `/api/attachments/${attachmentId}/content?token=token`,
        expiresAt: '2026-05-29T00:05:00.000Z',
      }),
    )

    await expect(getAttachment(attachmentId)).resolves.toEqual(attachment)
    await expect(
      createAttachmentSignedUrl(attachmentId, { disposition: ATTACHMENT_DISPOSITION_INLINE }),
    ).resolves.toMatchObject({
      expiresAt: '2026-05-29T00:05:00.000Z',
    })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/attachments/${attachmentId}`,
    })
    expectFetchCall(fetchMock, 1, {
      method: 'POST',
      pathname: `/api/attachments/${attachmentId}/signed-url`,
    })
    expectJsonBody(fetchMock, 1, { disposition: ATTACHMENT_DISPOSITION_INLINE })
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
        usage: ATTACHMENT_USAGE_AVATAR,
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
        usage: ATTACHMENT_USAGE_AVATAR,
        keyword: 'avatar',
      },
    })
  })

  it('deletes attachments and parses errors', async () => {
    const fetchMock = createFetchMock(
      emptyResponse(),
      jsonResponse({ message: '不支持的文件类型' }, { status: 400 }),
    )
    const expectedError: Partial<AttachmentRequestError> = {
      message: '不支持的文件类型',
      status: 400,
    }

    await expect(deleteAttachment(attachmentId)).resolves.toBeUndefined()
    await expect(
      uploadAttachment(new File(['bad'], 'bad.svg'), { usage: ATTACHMENT_USAGE_AVATAR }),
    ).rejects.toMatchObject(expectedError)

    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/attachments/${attachmentId}`,
    })
  })
})
