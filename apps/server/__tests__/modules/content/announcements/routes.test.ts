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
import type { requireAccess, requireAnyAccess } from '../../../../src/middleware/access'
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
const jsonHeaders = { 'content-type': 'application/json' }

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    archive: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    listImageOptions: vi.fn(),
    list: vi.fn(),
    publish: vi.fn(),
    targetOptions: vi.fn(),
    update: vi.fn(),
  }

  return {
    accessMiddleware,
    createAnnouncementService: vi.fn(() => service),
    recordOperation: vi.fn(),
    requireAccess: vi.fn<typeof requireAccess>(() => accessMiddleware),
    requireAnyAccess: vi.fn<typeof requireAnyAccess>(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
  requireAnyAccess: mocks.requireAnyAccess,
}))

vi.mock('../../../../src/modules/content/announcements/service', () => ({
  createAnnouncementService: mocks.createAnnouncementService,
}))

vi.mock('../../../../src/middleware/operation-log', () => ({
  recordOperation: mocks.recordOperation,
}))

function createTestApp() {
  return new Hono().route('/api/content/announcements', createAnnouncementRoutes({} as never))
}

describe('announcement routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.requireAnyAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.createAnnouncementService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue(listResponse)
    mocks.service.listImageOptions.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 })
    mocks.service.get.mockResolvedValue(announcement)
    mocks.service.targetOptions.mockResolvedValue({
      users: [],
      departments: [],
      roles: [],
    })
    mocks.service.create.mockResolvedValue(announcement)
    mocks.service.update.mockResolvedValue({ ...announcement, title: '维护通知（更新）' })
    mocks.service.publish.mockResolvedValue(undefined)
    mocks.service.archive.mockResolvedValue(undefined)
    mocks.service.delete.mockResolvedValue(undefined)
  })

  it.each([
    { method: 'GET', path: '', access: 'list', status: 200 },
    { method: 'GET', path: '/target-options', access: 'list', status: 200 },
    { method: 'GET', path: `/${announcementId}`, access: 'list', status: 200 },
    { method: 'POST', path: '', access: 'create', status: 201, body: createBody },
    {
      method: 'PATCH',
      path: `/${announcementId}`,
      access: 'update',
      status: 200,
      body: { title: 'Updated' },
    },
    { method: 'POST', path: `/${announcementId}/publish`, access: 'update', status: 204 },
    { method: 'POST', path: `/${announcementId}/archive`, access: 'update', status: 204 },
    { method: 'DELETE', path: `/${announcementId}`, access: 'delete', status: 204 },
  ])(
    'requires the $access guard on $method $path',
    async ({ method, path, access, status, body }) => {
      mocks.requireAccess.mockImplementation((code) => async (c, next) => {
        if (c.req.header('x-test-access') !== code) return c.json({ message: '无权访问' }, 403)
        await next()
      })
      const app = createTestApp()
      const request = (granted: string) =>
        app.request(`/api/content/announcements${path}`, {
          method,
          ...(body ? { body: JSON.stringify(body) } : {}),
          headers: { ...jsonHeaders, 'x-test-access': granted },
        })
      expect((await request('content:announcement:unrelated')).status).toBe(403)
      for (const service of Object.values(mocks.service)) expect(service).not.toHaveBeenCalled()
      expect((await request(`content:announcement:${access}`)).status).toBe(status)
    },
  )

  it('parses list query and delegates to the announcement service', async () => {
    const app = createTestApp()

    const response = await app.request(
      '/api/content/announcements?page=2&pageSize=5&keyword=维护&type=notice&status=published&pinned=true',
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(listResponse)
    expect(mocks.service.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      keyword: '维护',
      type: 'notice',
      status: 'published',
      pinned: true,
    })
  })

  it('normalizes default announcement create fields before delegation', async () => {
    const app = createTestApp()
    const createResponse = await app.request('/api/content/announcements', {
      method: 'POST',
      body: JSON.stringify(createBody),
      headers: jsonHeaders,
    })

    expect(createResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith({
      ...createBody,
      publish: false,
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      targets: [],
    })
    expect(mocks.recordOperation).toHaveBeenCalledWith(
      expect.anything(),
      'content:announcement:create',
      { targetLabel: '维护通知' },
    )
    expect(mocks.recordOperation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.service.create.mock.invocationCallOrder[0]!,
    )
    expect(JSON.stringify(mocks.recordOperation.mock.calls)).not.toMatch(
      /contentJson|今晚维护|targets|summary/,
    )
  })

  it('delegates announcement title updates to the service', async () => {
    const app = createTestApp()
    const updateResponse = await app.request(`/api/content/announcements/${announcementId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '维护通知（更新）' }),
      headers: jsonHeaders,
    })

    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(announcementId, { title: '维护通知（更新）' })
    expect(mocks.recordOperation).toHaveBeenCalledWith(
      expect.anything(),
      'content:announcement:update',
      { targetKey: announcementId, targetLabel: '维护通知（更新）' },
    )
    expect(mocks.recordOperation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.service.update.mock.invocationCallOrder[0]!,
    )
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

    const targetOptionsResponse = await app.request(
      '/api/content/announcements/target-options?announcementId=not-a-uuid',
    )
    expect(targetOptionsResponse.status).toBe(400)
    expect(await targetOptionsResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.targetOptions).not.toHaveBeenCalled()

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

    const missingTargetsResponse = await app.request(
      `/api/content/announcements/${announcementId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ visibility: ANNOUNCEMENT_VISIBILITY_TARGETED, targets: [] }),
        headers: jsonHeaders,
      },
    )
    expect(missingTargetsResponse.status).toBe(400)
    expect(await missingTargetsResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.update).not.toHaveBeenCalled()

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
