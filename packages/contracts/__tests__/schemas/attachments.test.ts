import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_CLEANUP_POLICY_MANUAL,
  ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  attachmentCleanupPolicySchema,
  attachmentContentUrlInputSchema,
  attachmentContentUrlSchema,
  attachmentImageListQuerySchema,
  attachmentImageListResponseSchema,
  attachmentListQuerySchema,
  attachmentListResponseSchema,
  attachmentReadPolicySchema,
  attachmentSchema,
  attachmentTransferRequestSchema,
  attachmentUploadSessionCompleteInputSchema,
  attachmentUploadSessionCreateInputSchema,
  attachmentUploadSessionSchema,
  attachmentUsageSchema,
} from '../../src/attachments'
import { expectZodIssue } from '../helpers/schema'

const attachment = {
  id: '11111111-1111-4111-8111-111111111111',
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 12345,
  usage: 'avatar',
  readPolicy: 'signed',
  createdAt: '2026-05-29T00:00:00.000Z',
}

describe('attachment schemas', () => {
  it('parses attachment image list queries and attachment metadata responses', () => {
    expect(attachmentImageListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
    expect(
      attachmentImageListQuerySchema.parse({
        keyword: '  Cover  ',
        page: '2',
        pageSize: '5',
        usage: ' article-cover ',
      }),
    ).toEqual({
      keyword: 'Cover',
      page: 2,
      pageSize: 5,
      usage: 'article-cover',
    })
    expect(attachmentImageListQuerySchema.parse({ keyword: ' ', usage: ' ' })).toEqual({
      page: 1,
      pageSize: 20,
    })
    expectZodIssue(attachmentImageListQuerySchema.safeParse({ pageSize: '101' }), {
      message: '每页数量不能超过 100',
      path: ['pageSize'],
    })

    const attachment = {
      id: '11111111-1111-4111-8111-111111111111',
      originalName: 'Cover.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 42,
      usage: 'announcement-content-image',
      readPolicy: 'authenticated',
      createdAt: '2026-05-24T09:00:00.000Z',
    }
    expect(
      attachmentImageListResponseSchema.parse({
        list: [attachment],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({ list: [attachment], total: 1, page: 1, pageSize: 20 })
  })

  it('parses attachment list queries and responses', () => {
    expect(
      attachmentListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        usage: 'avatar',
        keyword: ' avatar.png ',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      usage: 'avatar',
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
          usage: 'avatar',
          readPolicy: 'signed',
          createdBy: {
            id: '22222222-2222-4222-8222-222222222222',
            username: 'ada',
            nickname: 'Ada Lovelace',
          },
          references: [],
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
          ...attachment,
          createdAt: '2026-05-30T00:00:00.000Z',
          references: [],
        },
      ],
    })
  })

  it('accepts arbitrary non-blank attachment usages', () => {
    expect(attachmentUsageSchema.parse('general')).toBe('general')
    expect(attachmentUsageSchema.parse('avatar')).toBe('avatar')
    expect(attachmentUsageSchema.parse('rich-text-image')).toBe('rich-text-image')
    expectZodIssue(attachmentUsageSchema.safeParse(''), { message: '上传用途无效', path: [] })
    expectZodIssue(attachmentUsageSchema.safeParse('   '), { message: '上传用途无效', path: [] })
  })

  it('parses attachment read policies', () => {
    expect(attachmentReadPolicySchema.parse('signed')).toBe('signed')
    expect(attachmentReadPolicySchema.parse('authenticated')).toBe('authenticated')
    expectZodIssue(attachmentReadPolicySchema.safeParse('public'), {
      message: '访问方式无效',
      path: [],
    })
  })

  it('parses attachment cleanup policies', () => {
    expect(attachmentCleanupPolicySchema.parse(ATTACHMENT_CLEANUP_POLICY_MANUAL)).toBe(
      ATTACHMENT_CLEANUP_POLICY_MANUAL,
    )
    expect(attachmentCleanupPolicySchema.parse(ATTACHMENT_CLEANUP_POLICY_UNREFERENCED)).toBe(
      ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
    )
    expectZodIssue(attachmentCleanupPolicySchema.safeParse('auto'), {
      message: '清理策略无效',
      path: [],
    })
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

    expectZodIssue(result, { code: 'unrecognized_keys', path: [], keys: ['dispostion'] })
  })

  it.each([
    ['originalName', ' '],
    ['mimeType', ''],
    ['extension', ' '],
  ])('rejects blank attachment %s', (field, value) => {
    expectZodIssue(attachmentSchema.safeParse({ ...attachment, [field]: value }), {
      message: '不能为空',
      path: [field],
    })
  })

  it('rejects blank transfer request url', () => {
    expectZodIssue(
      attachmentTransferRequestSchema.safeParse({
        url: '   ',
        method: 'GET',
        headers: {},
        expiresAt: '2026-05-29T00:05:00.000Z',
      }),
      { code: 'too_small', path: ['url'] },
    )
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
    expect(attachmentUploadSessionCompleteInputSchema.parse({})).toEqual({})
    expect(
      attachmentUploadSessionCreateInputSchema.parse({
        originalName: 'avatar.png',
        usage: 'avatar',
        size: 12345,
        contentType: 'image/png',
      }),
    ).toEqual({
      originalName: 'avatar.png',
      usage: 'avatar',
      readPolicy: 'signed',
      cleanupPolicy: 'manual',
      size: 12345,
      contentType: 'image/png',
    })

    expect(
      attachmentUploadSessionCreateInputSchema.parse({
        originalName: 'editor-image.png',
        usage: 'rich-text-image',
        readPolicy: 'authenticated',
        cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
        size: 12345,
      }),
    ).toMatchObject({
      usage: 'rich-text-image',
      readPolicy: 'authenticated',
      cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
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

  it.each([
    {
      name: 'negative size',
      input: { size: -1 },
      issue: { code: 'too_small' as const, path: ['size'] },
    },
    {
      name: 'unknown field',
      input: { size: 1, extra: true },
      issue: { code: 'unrecognized_keys' as const, path: [], keys: ['extra'] },
    },
  ])('rejects upload session $name', ({ input, issue }) => {
    expectZodIssue(
      attachmentUploadSessionCreateInputSchema.safeParse({
        originalName: 'avatar.png',
        usage: 'avatar',
        ...input,
      }),
      { ...issue, path: [...issue.path] },
    )
  })
})
