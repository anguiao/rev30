import { describe, expect, it } from 'vitest'
import {
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  announcementFormSchema,
  announcementMyDetailSchema,
  announcementMyListItemSchema,
  announcementMyListQuerySchema,
  announcementMyListResponseSchema,
  announcementListItemSchema,
  announcementListQuerySchema,
  announcementListResponseSchema,
  announcementSchema,
  announcementCreateSchema,
  announcementTargetSchema,
  announcementUpdateSchema,
} from '../../../src/content/announcements'
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
const imageOnlyContentJson = {
  type: 'doc',
  content: [
    {
      type: 'image',
      attrs: {
        src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
        alt: '示意图',
      },
    },
  ],
}

describe('announcement schemas', () => {
  it('accepts detail and list response shapes', () => {
    const announcement = {
      id: announcementId,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentHtml: '<p>今晚维护</p>',
      summary: '今晚维护',
      contentJson,
      contentText: '系统维护通知',
      status: ANNOUNCEMENT_STATUS_PUBLISHED,
      pinned: true,
      publishedAt: '2026-05-24T10:00:00.000Z',
      createdAt: '2026-05-24T09:00:00.000Z',
      updatedAt: '2026-05-24T10:00:00.000Z',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [],
    }

    expect(announcementSchema.parse(announcement)).toMatchObject({
      id: announcementId,
      title: '维护通知',
      contentJson,
    })
    const {
      contentHtml: _contentHtml,
      targets: _targets,
      ...announcementListItemInput
    } = {
      ...announcement,
      readStats: null,
    }

    expect(announcementListItemSchema.parse(announcementListItemInput)).not.toHaveProperty(
      'contentJson',
    )
    expect(announcementListItemSchema.parse(announcementListItemInput)).not.toHaveProperty(
      'contentText',
    )
    expect(announcementListItemSchema.parse(announcementListItemInput)).not.toHaveProperty(
      'contentHtml',
    )
    expect(announcementListItemSchema.parse(announcementListItemInput)).not.toHaveProperty(
      'targets',
    )
    expect(announcementListItemSchema.parse(announcementListItemInput).readStats).toBeNull()
    expect(
      announcementListResponseSchema.parse({
        list: [
          {
            ...announcement,
            readStats: {
              recipientCount: 3,
              readCount: 1,
              unreadCount: 2,
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({
      total: 1,
      list: [{ title: '维护通知', readStats: { recipientCount: 3, readCount: 1 } }],
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
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      targets: [],
      pinned: false,
      publish: false,
    })
  })

  it('accepts explicit form input values', () => {
    expect(
      announcementFormSchema.parse({
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '  维护通知  ',
        summary: '   ',
        contentJson,
        visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
        pinned: false,
        publish: false,
        targets: [
          {
            targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
            targetId: '55555555-5555-4555-8555-555555555555',
          },
        ],
      }),
    ).toEqual({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      summary: null,
      contentJson,
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
          targetId: '55555555-5555-4555-8555-555555555555',
        },
      ],
      pinned: false,
      publish: false,
    })
  })

  it('requires visible objects for targeted visibility form inputs', () => {
    const formResult = announcementFormSchema.safeParse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      summary: null,
      contentJson,
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [],
      pinned: false,
      publish: false,
    })
    const createResult = announcementCreateSchema.safeParse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentJson,
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [],
    })
    const updateResult = announcementUpdateSchema.safeParse({
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [],
    })

    for (const result of [formResult, createResult, updateResult]) {
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(prettifyZodError(result)).toContain('请选择可见对象')
        expect(result.error.issues[0]?.path).toEqual(['targets'])
      }
    }
  })

  it('allows create input to publish immediately', () => {
    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_BULLETIN,
        title: '版本公告',
        contentJson,
        visibility: ANNOUNCEMENT_VISIBILITY_ALL,
        pinned: true,
        publish: true,
        targets: [],
      }),
    ).toMatchObject({
      type: ANNOUNCEMENT_TYPE_BULLETIN,
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      pinned: true,
      publish: true,
      targets: [],
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
      expect(prettifyZodError(result)).toContain('正文格式无效')
    }
  })

  it('requires non-empty announcement content input', () => {
    const result = announcementFormSchema.safeParse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      pinned: false,
      publish: false,
      targets: [],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('请输入正文')
    }
  })

  it('rejects whitespace-only announcement content input', () => {
    const result = announcementCreateSchema.safeParse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('请输入正文')
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

  it('accepts image-only announcement content input', () => {
    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '图片通知',
        contentJson: imageOnlyContentJson,
      }),
    ).toMatchObject({
      contentJson: imageOnlyContentJson,
    })
  })

  it('requires update input to contain at least one changed field', () => {
    expect(announcementUpdateSchema.parse({ title: '新标题' })).toEqual({ title: '新标题' })
    expect(announcementUpdateSchema.parse({ title: '新标题' })).not.toHaveProperty('pinned')
    expect(announcementUpdateSchema.parse({ title: '新标题' })).not.toHaveProperty('publish')
    expect(announcementUpdateSchema.parse({ publish: true })).toEqual({ publish: true })
    expect(announcementUpdateSchema.parse({ title: '新标题', publish: false })).toEqual({
      title: '新标题',
    })
    expect(announcementUpdateSchema.parse({ visibility: ANNOUNCEMENT_VISIBILITY_ALL })).toEqual({
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
    })
    expect(
      announcementUpdateSchema.parse({
        targets: [
          {
            targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
            targetId: '55555555-5555-4555-8555-555555555555',
          },
        ],
      }),
    ).toMatchObject({
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
          targetId: '55555555-5555-4555-8555-555555555555',
        },
      ],
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
      expect(error).toContain('类型无效')
      expect(error).toContain('状态无效')
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
          visibility: ANNOUNCEMENT_VISIBILITY_ALL,
          readStats: null,
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

  it('accepts contentHtml visibility and targets for announcement schema', () => {
    const announcement = {
      id: announcementId,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '可见范围公告',
      summary: null,
      contentHtml: '<p>维护公告内容</p>',
      contentJson: { type: 'doc', content: [] },
      contentText: '维护公告内容',
      status: ANNOUNCEMENT_STATUS_DRAFT,
      pinned: false,
      publishedAt: null,
      createdAt: '2026-05-24T09:00:00.000Z',
      updatedAt: '2026-05-24T10:00:00.000Z',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: 'role',
          targetId: '22222222-2222-4222-8222-222222222222',
        },
      ],
    }

    expect(announcementSchema.parse(announcement).targets).toEqual(announcement.targets)
    expect(announcementSchema.parse(announcement).visibility).toBe(ANNOUNCEMENT_VISIBILITY_TARGETED)
    expect(announcementSchema.parse(announcement).contentHtml).toBe(announcement.contentHtml)
  })

  it('defaults create schema to all visibility and keeps publish with all visibility', () => {
    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '默认可见范围',
        contentJson,
      }),
    ).toMatchObject({
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      targets: [],
      publish: false,
    })

    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '全员发布',
        visibility: ANNOUNCEMENT_VISIBILITY_ALL,
        publish: true,
        contentJson,
      }).visibility,
    ).toBe(ANNOUNCEMENT_VISIBILITY_ALL)
  })

  it('fails when duplicate visibility targets exist with same type and id', () => {
    const result = announcementCreateSchema.safeParse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '重复可见对象测试',
      contentJson,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
          targetId: '33333333-3333-4333-8333-333333333333',
        },
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
          targetId: '33333333-3333-4333-8333-333333333333',
        },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('可见对象不能重复')
      const duplicateIssue = result.error.issues.find(
        (issue) => issue.message === '可见对象不能重复',
      )
      expect(duplicateIssue?.path).toContain(1)
    }
  })

  it('parses my announcement list query with normalized page size type and trimmed keyword', () => {
    const parsed = announcementMyListQuerySchema.parse({
      page: '2',
      pageSize: '5',
      type: ' notice ',
      keyword: '  公告  ',
    })

    expect(parsed).toMatchObject({
      page: 2,
      pageSize: 5,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      keyword: '公告',
    })
  })

  it('parses my announcement list and detail schemas without editor json', () => {
    expect(
      announcementMyListItemSchema.parse({
        id: announcementId,
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '列表公告',
        summary: '列表摘要',
        pinned: true,
        publishedAt: '2026-05-24T10:00:00.000Z',
      }),
    ).toMatchObject({
      id: announcementId,
      title: '列表公告',
      type: ANNOUNCEMENT_TYPE_NOTICE,
      summary: '列表摘要',
      pinned: true,
      publishedAt: '2026-05-24T10:00:00.000Z',
    })

    expect(
      announcementMyDetailSchema.parse({
        id: announcementId,
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '详情公告',
        summary: '详情摘要',
        pinned: false,
        publishedAt: '2026-05-24T10:00:00.000Z',
        contentHtml: '<p>详情内容</p>',
      }),
    ).toMatchObject({
      id: announcementId,
      contentHtml: '<p>详情内容</p>',
    })

    expect(
      announcementMyListResponseSchema.parse({
        list: [
          {
            id: announcementId,
            type: ANNOUNCEMENT_TYPE_NOTICE,
            title: '列表公告',
            summary: null,
            pinned: true,
            publishedAt: '2026-05-24T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({
      total: 1,
      pageSize: 20,
      list: [{ title: '列表公告' }],
    })
  })

  it('accepts role target type for announcement targets', () => {
    expect(
      announcementTargetSchema.parse({
        targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
        targetId: '44444444-4444-4444-8444-444444444444',
      }),
    ).toEqual({
      targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
      targetId: '44444444-4444-4444-8444-444444444444',
    })
  })
})
