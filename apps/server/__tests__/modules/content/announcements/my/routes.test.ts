import type { User } from '@rev30/contracts'
import {
  ANNOUNCEMENT_TYPE_NOTICE,
  type AnnouncementMyDetail,
  type AnnouncementMyListItem,
  type AnnouncementMyListResponse,
} from '@rev30/contracts'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyAnnouncementNotFoundError } from '../../../../../src/modules/content/announcements/my/errors'
import { createMyAnnouncementRoutes } from '../../../../../src/modules/content/announcements/my/routes'

const announcementId = '11111111-1111-4111-8111-111111111111'
const currentUser: User = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'current-user',
  nickname: 'Current User',
  email: null,
  phone: null,
  status: 1,
  builtIn: false,
  departments: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Product',
      code: 'product',
    },
  ],
  roles: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Editor',
      code: 'editor',
    },
  ],
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
}

const listItem: AnnouncementMyListItem = {
  id: announcementId,
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '今晚维护',
  pinned: true,
  publishedAt: '2026-05-19T00:00:00.000Z',
}

const listResponse: AnnouncementMyListResponse = {
  list: [listItem],
  total: 1,
  page: 2,
  pageSize: 5,
}

const detailResponse: AnnouncementMyDetail = {
  ...listItem,
  contentHtml: '<p>今晚维护</p>',
}

const mocks = vi.hoisted(() => {
  const service = {
    get: vi.fn(),
    list: vi.fn(),
  }

  return {
    createMyAnnouncementService: vi.fn(() => service),
    service,
  }
})

vi.mock('../../../../../src/modules/content/announcements/my/service', () => ({
  createMyAnnouncementService: mocks.createMyAnnouncementService,
}))

function createTestApp() {
  return new Hono<{ Variables: { currentUser: User } }>()
    .use('/api/content/announcements/my/*', async (c, next) => {
      c.set('currentUser', currentUser)
      await next()
    })
    .use('/api/content/announcements/my', async (c, next) => {
      c.set('currentUser', currentUser)
      await next()
    })
    .route('/api/content/announcements/my', createMyAnnouncementRoutes({} as never))
}

describe('my announcement routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMyAnnouncementService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue(listResponse)
    mocks.service.get.mockResolvedValue(detailResponse)
  })

  it('parses list query and delegates list/detail calls with current user', async () => {
    const app = createTestApp()

    const listHttpResponse = await app.request(
      '/api/content/announcements/my?page=2&pageSize=5&keyword=维护&type=notice',
    )
    expect(listHttpResponse.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith(currentUser, {
      page: 2,
      pageSize: 5,
      keyword: '维护',
      type: 'notice',
    })

    const detailHttpResponse = await app.request(`/api/content/announcements/my/${announcementId}`)
    expect(detailHttpResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(currentUser, announcementId)
  })

  it('returns validation errors before calling service methods', async () => {
    const app = createTestApp()

    const queryResponse = await app.request('/api/content/announcements/my?page=0')
    expect(queryResponse.status).toBe(400)
    expect(await queryResponse.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.list).not.toHaveBeenCalled()

    const idResponse = await app.request('/api/content/announcements/my/not-a-uuid')
    expect(idResponse.status).toBe(400)
    expect(await idResponse.json()).toEqual({ message: '通知公告 ID 无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('maps not found error to 404', async () => {
    const app = createTestApp()

    mocks.service.get.mockRejectedValueOnce(new MyAnnouncementNotFoundError())

    const response = await app.request(`/api/content/announcements/my/${announcementId}`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: '通知公告不存在' })
  })
})
