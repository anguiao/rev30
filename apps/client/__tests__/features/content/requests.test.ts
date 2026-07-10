import {
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_NOTICE,
  type Announcement,
  type AnnouncementCreateInput,
  type AnnouncementMyDetail,
  type AnnouncementUpdateInput,
  type CustomIconSet,
} from '@rev30/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import {
  archiveAnnouncement,
  createAnnouncement,
  createCustomIconSet,
  deleteAnnouncement,
  deleteCustomIcon,
  deleteCustomIconSet,
  exportCustomIconSet,
  getAnnouncement,
  getAnnouncementTargetOptions,
  getCustomIconSet,
  getMyAnnouncement,
  listAnnouncements,
  listBuiltinIcons,
  listBuiltinIconSets,
  listCustomIcons,
  listCustomIconSets,
  listMyAnnouncements,
  publishAnnouncement,
  renameCustomIcon,
  updateAnnouncement,
  updateCustomIconSet,
  uploadCustomIcons,
} from '../../../src/features/content'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const announcementId = '11111111-1111-4111-8111-111111111111'

const announcementResponse: Announcement = {
  id: announcementId,
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '系统维护公告',
  contentJson: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '系统将进行维护' }] }],
  },
  contentText: '系统将进行维护',
  contentHtml: '<p>系统将进行维护</p>',
  visibility: 'targeted',
  targets: [],
  status: ANNOUNCEMENT_STATUS_PUBLISHED,
  pinned: false,
  publishedAt: '2026-05-20T08:00:00.000Z',
  createdAt: '2026-05-20T07:00:00.000Z',
  updatedAt: '2026-05-20T07:10:00.000Z',
}

const myAnnouncementResponse: AnnouncementMyDetail = {
  id: announcementId,
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '我的维护通知',
  summary: '仅对我可见',
  contentHtml: '<p>仅对我可见</p>',
  pinned: true,
  publishedAt: '2026-05-20T08:00:00.000Z',
}

const createInput: AnnouncementCreateInput = {
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '新增维护公告',
  summary: '即将更新服务',
  contentJson: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '即将更新服务' }] }],
  },
  visibility: 'targeted',
  targets: [],
  pinned: false,
  publish: false,
}

const updateInput: AnnouncementUpdateInput = {
  title: '维护通知（更新）',
}

const customIconSetResponse: CustomIconSet = {
  prefix: 'acme',
  name: 'Acme Icons',
  description: null,
  iconCount: 2,
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T01:00:00.000Z',
}

const builtinIconResponse = {
  icon: 'lucide:user-add',
  prefix: 'lucide',
  name: 'user-add',
  setName: 'Lucide',
  body: '<path d="M0 0h24v24H0z"/>',
  width: 24,
  height: 24,
}

const customIconResponse = {
  ...builtinIconResponse,
  icon: 'acme:user-add',
  prefix: 'acme',
  setName: 'Acme Icons',
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T01:00:00.000Z',
}

beforeEach(() => {
  createTestPinia()
})

describe('content request helpers', () => {
  it('lists announcements with query params and parses response', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [{ ...announcementResponse, readStats: null }],
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
    expect(result.list[0]?.readStats).toBeNull()
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

  it('gets announcement target options for editing', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        users: [],
        departments: [],
        roles: [],
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getAnnouncementTargetOptions(announcementId)

    expect(result).toEqual({ users: [], departments: [], roles: [] })
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/announcements/target-options',
      query: { announcementId },
    })
  })

  it('lists my announcements with query params and parses response', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [myAnnouncementResponse],
        total: 1,
        page: 2,
        pageSize: 5,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await listMyAnnouncements({
      page: 2,
      pageSize: 5,
      keyword: '维护',
      type: ANNOUNCEMENT_TYPE_NOTICE,
    })

    expect(result.total).toBe(1)
    expect(result.list[0]?.id).toBe(announcementId)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/announcements/my',
      query: {
        page: '2',
        pageSize: '5',
        keyword: '维护',
        type: ANNOUNCEMENT_TYPE_NOTICE,
      },
    })
  })

  it('gets my announcement detail and parses response', async () => {
    const fetchMock = createFetchMock(jsonResponse(myAnnouncementResponse))
    useAuthStore().accessToken = 'access-token'

    const result = await getMyAnnouncement(announcementId)

    expect(result.id).toBe(announcementId)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/content/announcements/my/${announcementId}`,
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

  it('publishes announcements', async () => {
    const fetchMock = createFetchMock(new Response(null, { status: 204 }))
    useAuthStore().accessToken = 'access-token'

    await expect(publishAnnouncement(announcementId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: `/api/content/announcements/${announcementId}/publish`,
    })
  })

  it('archives announcements', async () => {
    const fetchMock = createFetchMock(new Response(null, { status: 204 }))
    useAuthStore().accessToken = 'access-token'

    await expect(archiveAnnouncement(announcementId)).resolves.toBeUndefined()

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

  it('gets custom icon set detail and parses response', async () => {
    const fetchMock = createFetchMock(jsonResponse(customIconSetResponse))
    useAuthStore().accessToken = 'access-token'

    const result = await getCustomIconSet('acme')

    expect(result).toEqual(customIconSetResponse)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/icon-sets/custom/acme',
    })
  })

  it('lists built-in and custom icon sets with normalized filters', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [{ prefix: 'lucide', name: 'Lucide', total: 1000 }],
        total: 1,
      }),
      jsonResponse({
        list: [customIconSetResponse],
        total: 1,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(listBuiltinIconSets({ keyword: 'user' })).resolves.toMatchObject({ total: 1 })
    await expect(listCustomIconSets({ keyword: 'acme' })).resolves.toMatchObject({
      list: [{ prefix: 'acme' }],
      total: 1,
    })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/icon-sets/builtin',
      query: { keyword: 'user' },
    })
    expectFetchCall(fetchMock, 1, {
      method: 'GET',
      pathname: '/api/content/icon-sets/custom',
      query: { keyword: 'acme' },
    })
  })

  it('lists built-in and custom icons with cursor pagination', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [builtinIconResponse],
        nextCursor: 'lucide:user-check',
        pageSize: 20,
      }),
      jsonResponse({
        list: [customIconResponse],
        nextCursor: null,
        pageSize: 20,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(
      listBuiltinIcons({
        keyword: 'user',
        prefix: 'lucide',
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ nextCursor: 'lucide:user-check' })
    await expect(
      listCustomIcons({
        keyword: 'user',
        prefix: 'acme',
        cursor: 'acme:user-add',
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ list: [{ icon: 'acme:user-add' }], nextCursor: null })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/content/icon-sets/builtin/icons',
      query: {
        keyword: 'user',
        prefix: 'lucide',
        cursor: undefined,
        pageSize: '20',
      },
    })
    expectFetchCall(fetchMock, 1, {
      method: 'GET',
      pathname: '/api/content/icon-sets/custom/icons',
      query: {
        keyword: 'user',
        prefix: 'acme',
        cursor: 'acme:user-add',
        pageSize: '20',
      },
    })
  })

  it('creates, updates, and deletes custom icon sets', async () => {
    const updatedIconSet = { ...customIconSetResponse, name: 'Acme Updated' }
    const fetchMock = createFetchMock(
      jsonResponse(customIconSetResponse, { status: 201 }),
      jsonResponse(updatedIconSet),
      emptyResponse(),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(
      createCustomIconSet({ prefix: 'acme', name: 'Acme Icons', description: null }),
    ).resolves.toEqual(customIconSetResponse)
    await expect(updateCustomIconSet('acme', { name: 'Acme Updated' })).resolves.toEqual(
      updatedIconSet,
    )
    await expect(deleteCustomIconSet('acme')).resolves.toBeUndefined()

    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/content/icon-sets/custom',
    })
    expectJsonBody(fetchMock, 0, {
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
    })
    expectFetchCall(fetchMock, 1, {
      method: 'PATCH',
      pathname: '/api/content/icon-sets/custom/acme',
    })
    expectJsonBody(fetchMock, 1, { name: 'Acme Updated' })
    expectFetchCall(fetchMock, 2, {
      method: 'DELETE',
      pathname: '/api/content/icon-sets/custom/acme',
    })
  })

  it('uploads custom icons as multipart form data and parses partial results', async () => {
    const uploadResponse = {
      created: [customIconResponse],
      replaced: [],
      skipped: [
        {
          name: 'existing',
          sourceFilename: 'existing.svg',
          reason: 'duplicate' as const,
        },
      ],
      failed: [{ sourceFilename: 'bad.svg', message: 'SVG 无效' }],
    }
    const fetchMock = createFetchMock(jsonResponse(uploadResponse))
    const files = [
      new File(['<svg />'], 'user-add.svg', { type: 'image/svg+xml' }),
      new File(['<svg />'], 'existing.svg', { type: 'image/svg+xml' }),
    ]
    useAuthStore().accessToken = 'access-token'

    await expect(
      uploadCustomIcons('acme', { duplicateStrategy: 'replace', files }),
    ).resolves.toEqual(uploadResponse)

    const call = expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/content/icon-sets/custom/acme/icons',
    })
    const form = call.init.body

    expect(form).toBeInstanceOf(FormData)
    expect((form as FormData).get('duplicateStrategy')).toBe('replace')
    expect((form as FormData).getAll('files')).toEqual(files)
  })

  it('renames and deletes custom icons', async () => {
    const renamedIcon = {
      ...customIconResponse,
      icon: 'acme:account-add',
      name: 'account-add',
    }
    const fetchMock = createFetchMock(jsonResponse(renamedIcon), emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await expect(renameCustomIcon('acme', 'user-add', { name: 'account-add' })).resolves.toEqual(
      renamedIcon,
    )
    await expect(deleteCustomIcon('acme', 'account-add')).resolves.toBeUndefined()

    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: '/api/content/icon-sets/custom/acme/icons/user-add',
    })
    expectJsonBody(fetchMock, 0, { name: 'account-add' })
    expectFetchCall(fetchMock, 1, {
      method: 'DELETE',
      pathname: '/api/content/icon-sets/custom/acme/icons/account-add',
    })
  })

  it('exports custom icon sets through authenticated fetch', async () => {
    const fetchMock = createFetchMock(
      new Response('{"prefix":"acme","icons":{}}', {
        headers: {
          'content-disposition': 'attachment; filename="acme.json"',
          'content-type': 'application/json',
        },
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await exportCustomIconSet('acme')
    const call = expectFetchCall(fetchMock, 0, {
      pathname: '/api/content/icon-sets/custom/acme/export',
    })

    expect(call.headers.get('authorization')).toBe('Bearer access-token')
    expect(result.filename).toBe('acme.json')
    expect(await result.blob.text()).toBe('{"prefix":"acme","icons":{}}')
  })

  it('returns export errors when response json contains message', async () => {
    createFetchMock(
      new Response(JSON.stringify({ message: '无权导出图标集' }), {
        status: 403,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const failedExport = exportCustomIconSet('acme')

    await expect(failedExport).rejects.toBeInstanceOf(ApiRequestError)
    await expect(failedExport).rejects.toMatchObject({
      status: 403,
      message: '无权导出图标集',
    })
  })

  it('returns content error fields when response json contains field and message', async () => {
    const fetchMock = createFetchMock(
      new Response(JSON.stringify({ field: 'contentJson', message: '请输入正文' }), {
        status: 400,
      }),
    )
    useAuthStore().accessToken = 'access-token'

    const failedCreate = createAnnouncement(createInput)

    await expect(failedCreate).rejects.toBeInstanceOf(ApiRequestError)
    await expect(failedCreate).rejects.toMatchObject({
      status: 400,
      field: 'contentJson',
      message: '请输入正文',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/content/announcements',
    })
  })
})
