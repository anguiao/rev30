import { describe, expect, it } from 'vitest'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_ANNOUNCEMENT,
  ANNOUNCEMENT_TYPE_NOTICE,
  announcementListItemSchema,
  announcementListQuerySchema,
  announcementListResponseSchema,
  announcementSchema,
} from '../../../src/schemas/content/announcements'
import {
  announcementCreateSchema,
  announcementUpdateSchema,
} from '../../../src/schemas/content/announcement-write'
import { prettifyZodError } from '../../helpers/schema'

const announcementId = '11111111-1111-4111-8111-111111111111'
const contentJson = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '系统维护通知' }],
    },
  ],
}

describe('announcement schemas', () => {
  it('accepts detail and list response shapes', () => {
    const announcement = {
      id: announcementId,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      summary: '今晚维护',
      contentJson,
      contentText: '系统维护通知',
      status: ANNOUNCEMENT_STATUS_PUBLISHED,
      pinned: true,
      publishedAt: '2026-05-24T10:00:00.000Z',
      createdAt: '2026-05-24T09:00:00.000Z',
      updatedAt: '2026-05-24T10:00:00.000Z',
    }

    expect(announcementSchema.parse(announcement)).toMatchObject({
      id: announcementId,
      title: '维护通知',
      contentJson,
    })
    expect(announcementListItemSchema.parse(announcement)).not.toHaveProperty('contentJson')
    expect(announcementListItemSchema.parse(announcement)).not.toHaveProperty('contentText')
    expect(
      announcementListResponseSchema.parse({
        list: [announcement],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({
      total: 1,
      list: [{ title: '维护通知' }],
    })
  })

  it('normalizes create input defaults and blank summary', () => {
    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '  维护通知  ',
        summary: '   ',
        contentJson,
      }),
    ).toEqual({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      summary: null,
      contentJson,
      pinned: false,
      publish: false,
    })
  })

  it('allows create input to publish immediately', () => {
    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_ANNOUNCEMENT,
        title: '版本公告',
        contentJson,
        pinned: true,
        publish: true,
      }),
    ).toMatchObject({
      type: ANNOUNCEMENT_TYPE_ANNOUNCEMENT,
      pinned: true,
      publish: true,
    })
  })

  it('requires a doc-shaped content json object', () => {
    const result = announcementCreateSchema.safeParse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentJson: { type: 'paragraph' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('公告正文格式无效')
    }
  })

  it('rejects empty announcement content documents', () => {
    const result = announcementCreateSchema.safeParse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentJson: { type: 'doc', content: [] },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['contentJson'],
            message: '请输入公告正文',
          }),
        ]),
      )
    }
  })

  it('accepts non-empty announcement content documents', () => {
    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '维护通知',
        contentJson,
      }),
    ).toMatchObject({
      contentJson,
    })
  })

  it('requires update input to contain at least one changed field', () => {
    expect(announcementUpdateSchema.parse({ title: '新标题' })).toEqual({ title: '新标题' })
    expect(announcementUpdateSchema.parse({ title: '新标题' })).not.toHaveProperty('pinned')
    expect(announcementUpdateSchema.parse({ title: '新标题' })).not.toHaveProperty('publish')
    expect(announcementUpdateSchema.parse({ publish: true })).toEqual({ publish: true })
    expect(announcementUpdateSchema.parse({ title: '新标题', publish: false })).toEqual({
      title: '新标题',
      publish: false,
    })

    const result = announcementUpdateSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('至少修改一个字段')
    }

    const publishFalseOnlyResult = announcementUpdateSchema.safeParse({ publish: false })
    expect(publishFalseOnlyResult.success).toBe(false)
    if (!publishFalseOnlyResult.success) {
      expect(prettifyZodError(publishFalseOnlyResult)).toContain('至少修改一个字段')
    }
  })

  it('parses list query filters', () => {
    expect(
      announcementListQuerySchema.parse({
        page: '2',
        pageSize: '5',
        keyword: '  维护  ',
        type: ' notice ',
        status: ' published ',
        pinned: 'true',
      }),
    ).toEqual({
      page: 2,
      pageSize: 5,
      keyword: '维护',
      type: ANNOUNCEMENT_TYPE_NOTICE,
      status: ANNOUNCEMENT_STATUS_PUBLISHED,
      pinned: true,
    })
  })

  it('rejects invalid type, status, and pinned filters', () => {
    const result = announcementListQuerySchema.safeParse({
      type: 'news',
      status: 'enabled',
      pinned: 'yes',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const error = prettifyZodError(result)
      expect(error).toContain('公告类型无效')
      expect(error).toContain('公告状态无效')
      expect(error).toContain('置顶筛选无效')
    }
  })

  it('accepts all lifecycle statuses in responses', () => {
    for (const status of [
      ANNOUNCEMENT_STATUS_DRAFT,
      ANNOUNCEMENT_STATUS_PUBLISHED,
      ANNOUNCEMENT_STATUS_ARCHIVED,
    ]) {
      expect(
        announcementListItemSchema.parse({
          id: announcementId,
          type: ANNOUNCEMENT_TYPE_NOTICE,
          title: '维护通知',
          summary: null,
          status,
          pinned: false,
          publishedAt: null,
          createdAt: '2026-05-24T09:00:00.000Z',
          updatedAt: '2026-05-24T10:00:00.000Z',
        }),
      ).toMatchObject({ status })
    }
  })

  it('ignores blank pinned query and keeps default pagination', () => {
    const parsed = announcementListQuerySchema.parse({ pinned: '   ' })
    expect(parsed).toMatchObject({
      page: 1,
      pageSize: 20,
    })
    expect(parsed.pinned).toBeUndefined()
  })
})
