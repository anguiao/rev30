import {
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_NOTICE,
  type Announcement,
  type AnnouncementCreateInput,
  type AnnouncementUpdateInput,
} from '@rev30/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ContentRequestError,
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  archiveAnnouncement,
} from '../../../src/features/content'
import { useAuthStore } from '../../../src/stores/auth'
import { createFetchMock, expectFetchCall, expectJsonBody, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const announcementId = '11111111-1111-4111-8111-111111111111'

const announcementResponse: Announcement = {
  id: announcementId,
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '系统维护公告',
  contentJson: { type: 'doc', content: [] },
  contentText: '系统将进行维护',
  status: ANNOUNCEMENT_STATUS_PUBLISHED,
  pinned: false,
  publishedAt: '2026-05-20T08:00:00.000Z',
  createdAt: '2026-05-20T07:00:00.000Z',
  updatedAt: '2026-05-20T07:10:00.000Z',
}

const createInput: AnnouncementCreateInput = {
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '新增维护公告',
  summary: '即将更新服务',
  contentJson: { type: 'doc', content: [] },
  pinned: false,
  publish: false,
}

const updateInput: AnnouncementUpdateInput = {
  title: '维护通知（更新）',
}

beforeEach(() => {
  createTestPinia()
})

describe('content request helpers', () => {
  it('lists announcements with query params and parses response', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [announcementResponse],
        total: 1,
        page: 2,
        pageSize: 5,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await listAnnouncements({
      page: 2,
      pageSize: 5,
      keyword: '维护',
      type: ANNOUNCEMENT_TYPE_NOTICE,
      status: ANNOUNCEMENT_STATUS_PUBLISHED,
      pinned: true,
    })

    expect(result.total).toBe(1)
    expect(result.list[0]?.id).toBe(announcementId)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/announcements',
      query: {
        page: '2',
        pageSize: '5',
        keyword: '维护',
        type: ANNOUNCEMENT_TYPE_NOTICE,
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: 'true',
      },
    })
  })

  it('keeps false pinned in the query string', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await listAnnouncements({
      page: 1,
      pageSize: 20,
      pinned: false,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/announcements',
      query: {
        page: '1',
        pageSize: '20',
        pinned: 'false',
      },
    })
  })

  it('omits pinned when it is not provided', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await listAnnouncements({
      page: 1,
      pageSize: 20,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/announcements',
      query: {
        page: '1',
        pageSize: '20',
        pinned: undefined,
      },
    })
  })

  it('gets announcement detail and parses response', async () => {
    const fetchMock = createFetchMock(jsonResponse(announcementResponse))
    useAuthStore().accessToken = 'access-token'

    const result = await getAnnouncement(announcementId)

    expect(result.id).toBe(announcementId)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/content/announcements/${announcementId}`,
    })
  })

  it('creates announcements and sends body', async () => {
    const fetchMock = createFetchMock(jsonResponse(announcementResponse))
    useAuthStore().accessToken = 'access-token'

    const result = await createAnnouncement(createInput)

    expect(result.id).toBe(announcementId)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/content/announcements',
    })
    expectJsonBody(fetchMock, 0, createInput)
  })

  it('updates announcements and sends body', async () => {
    const fetchMock = createFetchMock(jsonResponse(announcementResponse))
    useAuthStore().accessToken = 'access-token'

    const result = await updateAnnouncement(announcementId, updateInput)

    expect(result.id).toBe(announcementId)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/content/announcements/${announcementId}`,
    })
    expectJsonBody(fetchMock, 0, updateInput)
  })

  it('publishes announcements and parses response', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ ...announcementResponse, status: ANNOUNCEMENT_STATUS_PUBLISHED }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await publishAnnouncement(announcementId)

    expect(result.status).toBe(ANNOUNCEMENT_STATUS_PUBLISHED)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: `/api/content/announcements/${announcementId}/publish`,
    })
  })

  it('archives announcements and parses response', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        ...announcementResponse,
        status: 'archived',
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await archiveAnnouncement(announcementId)

    expect(result.status).toBe('archived')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: `/api/content/announcements/${announcementId}/archive`,
    })
  })

  it('deletes announcements', async () => {
    const fetchMock = createFetchMock(new Response(null, { status: 204 }))
    useAuthStore().accessToken = 'access-token'

    await expect(deleteAnnouncement(announcementId)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/content/announcements/${announcementId}`,
    })
  })

  it('returns content error fields when response json contains field and message', async () => {
    const fetchMock = createFetchMock(
      new Response(JSON.stringify({ field: 'contentJson', message: '请输入公告正文' }), {
        status: 400,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const failedCreate = createAnnouncement(createInput)

    await expect(failedCreate).rejects.toBeInstanceOf(ContentRequestError)
    await expect(failedCreate).rejects.toMatchObject({
      status: 400,
      field: 'contentJson',
      message: '请输入公告正文',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/content/announcements',
    })
  })

  it('falls back when response error body is not structured', async () => {
    const fetchMock = createFetchMock(
      new Response('internal server error', {
        status: 500,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const failedGet = getAnnouncement(announcementId)

    await expect(failedGet).rejects.toBeInstanceOf(ContentRequestError)
    await expect(failedGet).rejects.toMatchObject({
      status: 500,
      message: '请求失败',
      field: undefined,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/content/announcements/${announcementId}`,
    })
  })
})
