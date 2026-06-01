import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
  attachmentContentUrlInputSchema,
  attachmentContentUrlSchema,
  attachmentListQuerySchema,
  attachmentListResponseSchema,
  attachmentSchema,
  attachmentTransferRequestSchema,
  attachmentUploadSessionCompleteInputSchema,
  attachmentUploadSessionCreateInputSchema,
  attachmentUploadSessionSchema,
  attachmentUsageSchema,
} from '../../src/attachments'

describe('attachment schemas', () => {
  it('parses attachment list queries and responses', () => {
    expect(
      attachmentListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        usage: ATTACHMENT_USAGE_AVATAR,
        keyword: ' avatar.png ',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      usage: ATTACHMENT_USAGE_AVATAR,
      keyword: 'avatar.png',
    })

    const listResponse = attachmentListResponseSchema.parse({
      list: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          originalName: 'avatar.png',
          mimeType: 'image/png',
          extension: 'png',
          size: 12345,
          usage: ATTACHMENT_USAGE_AVATAR,
          createdBy: {
            id: '22222222-2222-4222-8222-222222222222',
            username: 'ada',
            nickname: 'Ada Lovelace',
          },
          createdAt: '2026-05-30T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
    })

    expect(listResponse).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 10,
      list: [
        {
          createdBy: {
            id: '22222222-2222-4222-8222-222222222222',
            username: 'ada',
            nickname: 'Ada Lovelace',
          },
          originalName: 'avatar.png',
        },
      ],
    })
  })

  it('accepts attachment metadata responses', () => {
    expect(
      attachmentSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        originalName: 'avatar.png',
        mimeType: 'image/png',
        extension: 'png',
        size: 12345,
        usage: ATTACHMENT_USAGE_AVATAR,
        createdAt: '2026-05-29T00:00:00.000Z',
      }),
    ).toMatchObject({
      originalName: 'avatar.png',
      usage: ATTACHMENT_USAGE_AVATAR,
    })
  })

  it('exports supported upload usages', () => {
    expect(attachmentUsageSchema.parse(ATTACHMENT_USAGE_GENERAL)).toBe(ATTACHMENT_USAGE_GENERAL)
    expect(attachmentUsageSchema.parse(ATTACHMENT_USAGE_AVATAR)).toBe(ATTACHMENT_USAGE_AVATAR)
    expect(attachmentUsageSchema.parse(ATTACHMENT_USAGE_RICH_TEXT)).toBe(ATTACHMENT_USAGE_RICH_TEXT)
    expect(attachmentUsageSchema.safeParse('rich-text-image').success).toBe(false)
  })

  it('defaults content URL disposition to attachment', () => {
    expect(attachmentContentUrlInputSchema.parse({})).toEqual({
      disposition: ATTACHMENT_DISPOSITION_ATTACHMENT,
    })
    expect(
      attachmentContentUrlInputSchema.parse({
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).toEqual({
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
  })

  it('rejects unknown fields for content URL input', () => {
    const result = attachmentContentUrlInputSchema.safeParse({
      dispostion: ATTACHMENT_DISPOSITION_INLINE,
    })

    expect(result.success).toBe(false)
  })

  it('rejects blank attachment metadata string fields', () => {
    expect(
      attachmentSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        originalName: ' ',
        mimeType: 'image/png',
        extension: 'png',
        size: 123,
        usage: ATTACHMENT_USAGE_AVATAR,
        createdAt: '2026-05-29T00:00:00.000Z',
      }).success,
    ).toBe(false)

    expect(
      attachmentSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        originalName: 'avatar.png',
        mimeType: '',
        extension: 'png',
        size: 123,
        usage: ATTACHMENT_USAGE_AVATAR,
        createdAt: '2026-05-29T00:00:00.000Z',
      }).success,
    ).toBe(false)

    expect(
      attachmentSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        originalName: 'avatar.png',
        mimeType: 'image/png',
        extension: ' ',
        size: 123,
        usage: ATTACHMENT_USAGE_AVATAR,
        createdAt: '2026-05-29T00:00:00.000Z',
      }).success,
    ).toBe(false)
  })

  it('rejects blank transfer request url', () => {
    expect(
      attachmentTransferRequestSchema.safeParse({
        url: '   ',
        method: 'GET',
        headers: {},
        expiresAt: '2026-05-29T00:05:00.000Z',
      }).success,
    ).toBe(false)
  })

  it('accepts content URL responses', () => {
    expect(
      attachmentContentUrlSchema.parse({
        request: {
          url: '/api/attachments/11111111-1111-4111-8111-111111111111/content?token=abc',
          method: 'GET',
          headers: {},
          expiresAt: '2026-05-29T00:05:00.000Z',
        },
      }),
    ).toMatchObject({
      request: {
        method: 'GET',
        expiresAt: '2026-05-29T00:05:00.000Z',
      },
    })
  })

  it('accepts upload session requests and responses', () => {
    expect(
      attachmentUploadSessionCreateInputSchema.parse({
        originalName: 'avatar.png',
        usage: ATTACHMENT_USAGE_AVATAR,
        size: 12345,
        contentType: 'image/png',
      }),
    ).toEqual({
      originalName: 'avatar.png',
      usage: ATTACHMENT_USAGE_AVATAR,
      size: 12345,
      contentType: 'image/png',
    })

    expect(
      attachmentUploadSessionSchema.parse({
        uploadId: '11111111-1111-4111-8111-111111111111',
        request: {
          url: '/api/attachments/uploads/11111111-1111-4111-8111-111111111111/content?token=abc',
          method: 'PUT',
          headers: {
            'Content-Type': 'image/png',
          },
          expiresAt: '2026-05-29T00:05:00.000Z',
        },
      }),
    ).toMatchObject({
      request: {
        method: 'PUT',
        expiresAt: '2026-05-29T00:05:00.000Z',
      },
    })
  })

  it('validates upload session input shape', () => {
    expect(
      attachmentUploadSessionCreateInputSchema.safeParse({
        originalName: 'avatar.png',
        usage: ATTACHMENT_USAGE_AVATAR,
        size: -1,
      }).success,
    ).toBe(false)

    expect(
      attachmentUploadSessionCreateInputSchema.safeParse({
        originalName: 'avatar.png',
        usage: ATTACHMENT_USAGE_AVATAR,
        size: 1,
        extra: true,
      }).success,
    ).toBe(false)

    expect(attachmentUploadSessionCompleteInputSchema.parse({})).toEqual({})
  })
})
