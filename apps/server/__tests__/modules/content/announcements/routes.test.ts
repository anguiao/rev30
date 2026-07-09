import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_NOTICE,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
} from '@rev30/contracts'
import {
  AnnouncementContentInvalidError,
  AnnouncementDraftArchiveError,
  AnnouncementInvalidTargetError,
  AnnouncementNotFoundError,
  AnnouncementVisibilityTargetRequiredError,
} from '../../../../src/modules/content/announcements/errors'
import { createAnnouncementRoutes } from '../../../../src/modules/content/announcements/routes'

const announcementId = '11111111-1111-4111-8111-111111111111'
const announcement = {
  id: announcementId,
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '今晚维护',
  contentJson: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '今晚维护' }] }],
  },
  contentText: '今晚维护',
  contentHtml: '<p>今晚维护</p>',
  visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
  targets: [],
  status: ANNOUNCEMENT_STATUS_DRAFT,
  pinned: true,
  publishedAt: null,
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
}

const listResponse = {
  list: [
    {
      id: announcementId,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      summary: '今晚维护',
      status: ANNOUNCEMENT_STATUS_PUBLISHED,
      pinned: true,
      publishedAt: '2026-05-18T00:00:00.000Z',
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z',
      readStats: {
        recipientCount: 3,
        readCount: 1,
        unreadCount: 2,
      },
    },
  ],
  total: 1,
  page: 2,
  pageSize: 5,
}

const createBody = {
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '今晚维护',
  contentJson: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '今晚维护' }] }],
  },
  pinned: true,
}

const createBodyWithTargets = {
  ...createBody,
  visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
  targets: [
    {
      targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
      targetId: '22222222-2222-4222-8222-222222222222',
    },
    {
      targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
      targetId: '33333333-3333-4333-8333-333333333333',
    },
  ],
}

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    archive: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    publish: vi.fn(),
    update: vi.fn(),
  }

  return {
    accessMiddleware,
    createAnnouncementService: vi.fn(() => service),
    requireAccess: vi.fn(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/content/announcements/service', () => ({
  createAnnouncementService: mocks.createAnnouncementService,
}))

function createTestApp() {
  return new Hono().route('/api/content/announcements', createAnnouncementRoutes({} as never))
}

describe('announcement routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.createAnnouncementService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue(listResponse)
    mocks.service.get.mockResolvedValue(announcement)
    mocks.service.create.mockResolvedValue(announcement)
    mocks.service.update.mockResolvedValue({ ...announcement, title: '维护通知（更新）' })
    mocks.service.publish.mockResolvedValue(undefined)
    mocks.service.archive.mockResolvedValue(undefined)
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it('registers expected access guards for every announcement endpoint', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      [
        'content:announcement:list',
        'content:announcement:list',
        'content:announcement:create',
        'content:announcement:update',
        'content:announcement:update',
        'content:announcement:update',
        'content:announcement:delete',
      ],
    )
  })

  it('parses list query and delegates CRUD actions to the announcement service', async () => {
    const app = createTestApp()
    const headers = { 'content-type': 'application/json' }

    const listResponse = await app.request(
      '/api/content/announcements?page=2&pageSize=5&keyword=维护&type=notice&status=published&pinned=true',
    )
    expect(listResponse.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      keyword: '维护',
      type: 'notice',
      status: 'published',
      pinned: true,
    })

    const detailResponse = await app.request(`/api/content/announcements/${announcementId}`)
    expect(detailResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(announcementId)

    const createResponse = await app.request('/api/content/announcements', {
      method: 'POST',
      body: JSON.stringify(createBody),
      headers,
    })
    expect(createResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith({
      ...createBody,
      publish: false,
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      targets: [],
    })

    const createTargetsResponse = await app.request('/api/content/announcements', {
      method: 'POST',
      body: JSON.stringify(createBodyWithTargets),
      headers,
    })
    expect(createTargetsResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith({
      ...createBodyWithTargets,
      publish: false,
    })

    const updateResponse = await app.request(`/api/content/announcements/${announcementId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '维护通知（更新）' }),
      headers,
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(announcementId, { title: '维护通知（更新）' })

    const updateTargetsResponse = await app.request(
      `/api/content/announcements/${announcementId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
          targets: createBodyWithTargets.targets,
        }),
        headers,
      },
    )
    expect(updateTargetsResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(announcementId, {
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: createBodyWithTargets.targets,
    })

    const publishResponse = await app.request(
      `/api/content/announcements/${announcementId}/publish`,
      {
        method: 'POST',
      },
    )
    expect(publishResponse.status).toBe(204)
    expect(mocks.service.publish).toHaveBeenCalledWith(announcementId)

    const archiveResponse = await app.request(
      `/api/content/announcements/${announcementId}/archive`,
      {
        method: 'POST',
      },
    )
    expect(archiveResponse.status).toBe(204)
    expect(mocks.service.archive).toHaveBeenCalledWith(announcementId)

    const deleteResponse = await app.request(`/api/content/announcements/${announcementId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(announcementId)
  })

  it('returns validation errors before calling service methods', async () => {
    const app = createTestApp()

    const queryResponse = await app.request('/api/content/announcements?page=0')
    expect(queryResponse.status).toBe(400)
    expect(await queryResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()

    const idResponse = await app.request('/api/content/announcements/not-a-uuid')
    expect(idResponse.status).toBe(400)
    expect(await idResponse.json()).toEqual({ message: '通知公告 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const invalidBodyResponse = await app.request('/api/content/announcements', {
      method: 'POST',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidBodyResponse.status).toBe(400)
    expect(await invalidBodyResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()

    const createInvalidContentResponse = await app.request('/api/content/announcements', {
      method: 'POST',
      body: JSON.stringify({
        ...createBody,
        contentJson: { type: 'bad' },
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createInvalidContentResponse.status).toBe(400)
    expect(await createInvalidContentResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.create).not.toHaveBeenCalled()

    const publishFalseOnlyResponse = await app.request(
      `/api/content/announcements/${announcementId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ publish: false }),
        headers: { 'content-type': 'application/json' },
      },
    )
    expect(publishFalseOnlyResponse.status).toBe(400)
    expect(await publishFalseOnlyResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.update).not.toHaveBeenCalled()
  })

  it('maps announcement domain errors to route responses', async () => {
    const app = createTestApp()
    const headers = { 'content-type': 'application/json' }

    mocks.service.create.mockRejectedValueOnce(new AnnouncementContentInvalidError())
    const invalidContentCreateResponse = await app.request('/api/content/announcements', {
      method: 'POST',
      body: JSON.stringify(createBody),
      headers,
    })
    expect(invalidContentCreateResponse.status).toBe(400)
    expect(await invalidContentCreateResponse.json()).toEqual({
      field: 'contentJson',
      message: '正文格式无效',
    })

    mocks.service.update.mockRejectedValueOnce(new AnnouncementContentInvalidError())
    const invalidContentResponse = await app.request(
      `/api/content/announcements/${announcementId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          contentJson: {
            type: 'doc',
            content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
          },
        }),
        headers,
      },
    )
    expect(invalidContentResponse.status).toBe(400)
    expect(await invalidContentResponse.json()).toEqual({
      field: 'contentJson',
      message: '正文格式无效',
    })

    mocks.service.get.mockRejectedValueOnce(new AnnouncementNotFoundError())
    const notFoundResponse = await app.request(`/api/content/announcements/${announcementId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '通知公告不存在' })

    mocks.service.archive.mockRejectedValueOnce(new AnnouncementDraftArchiveError())
    const draftArchiveResponse = await app.request(
      `/api/content/announcements/${announcementId}/archive`,
      {
        method: 'POST',
      },
    )
    expect(draftArchiveResponse.status).toBe(400)
    expect(await draftArchiveResponse.json()).toEqual({ message: '草稿通知公告不能下线' })

    mocks.service.publish.mockRejectedValueOnce(new AnnouncementVisibilityTargetRequiredError())
    const targetRequiredResponse = await app.request(
      `/api/content/announcements/${announcementId}/publish`,
      {
        method: 'POST',
      },
    )
    expect(targetRequiredResponse.status).toBe(400)
    expect(await targetRequiredResponse.json()).toEqual({
      field: 'targets',
      message: '请选择可见对象',
    })

    mocks.service.update.mockRejectedValueOnce(new AnnouncementInvalidTargetError())
    const invalidTargetResponse = await app.request(
      `/api/content/announcements/${announcementId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ targets: createBodyWithTargets.targets }),
        headers,
      },
    )
    expect(invalidTargetResponse.status).toBe(400)
    expect(await invalidTargetResponse.json()).toEqual({
      field: 'targets',
      message: '可见对象无效',
    })
  })
})
