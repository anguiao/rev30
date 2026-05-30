import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
  attachmentListQuerySchema,
  attachmentListResponseSchema,
  attachmentSchema,
  attachmentSignedUrlInputSchema,
  attachmentSignedUrlSchema,
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

    expect(
      attachmentListResponseSchema.parse({
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
      }),
    )

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

  it('defaults signed URL disposition to attachment', () => {
    expect(attachmentSignedUrlInputSchema.parse({})).toEqual({
      disposition: ATTACHMENT_DISPOSITION_ATTACHMENT,
    })
    expect(
      attachmentSignedUrlInputSchema.parse({
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).toEqual({
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
  })

  it('rejects unknown fields for signed URL input', () => {
    const result = attachmentSignedUrlInputSchema.safeParse({
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

  it('rejects blank signed URL response url', () => {
    expect(
      attachmentSignedUrlSchema.safeParse({
        url: '   ',
        expiresAt: '2026-05-29T00:05:00.000Z',
      }).success,
    ).toBe(false)
  })

  it('accepts signed URL responses', () => {
    expect(
      attachmentSignedUrlSchema.parse({
        url: '/api/attachments/11111111-1111-4111-8111-111111111111/content?token=abc',
        expiresAt: '2026-05-29T00:05:00.000Z',
      }),
    ).toMatchObject({
      expiresAt: '2026-05-29T00:05:00.000Z',
    })
  })
})
