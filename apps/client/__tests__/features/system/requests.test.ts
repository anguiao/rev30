// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEPARTMENT_STATUS_ENABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_MENU,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/shared'
import {
  SystemRequestError,
  getDepartmentTree,
  getResourceTree,
  getSystemErrorMessage,
  listRoles,
  listUsers,
} from '../../../src/features/system'
import { useAuthStore } from '../../../src/stores/auth'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('system request helpers', () => {
  it('parses list responses from the system users endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await listUsers({
      page: 1,
      pageSize: 20,
      keyword: 'ada',
      status: USER_STATUS_ENABLED,
    })

    expect(result.total).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/users')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keyword=ada')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=1')
  })

  it('omits empty query values before sending requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await listUsers({
      page: 1,
      pageSize: 20,
      keyword: '',
      status: USER_STATUS_ENABLED,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('keyword=')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=1')
  })

  it('parses list responses from the system roles endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              name: '管理员',
              code: 'admin',
              status: ROLE_STATUS_ENABLED,
              sortOrder: 1,
              userCount: 2,
              createdAt: '2026-05-01T00:00:00.000Z',
              updatedAt: '2026-05-01T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 2,
          pageSize: 10,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await listRoles({
      page: 2,
      pageSize: 10,
      keyword: 'admin',
      status: ROLE_STATUS_ENABLED,
    })

    expect(result.list[0]?.code).toBe('admin')
    expect(result.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/roles')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keyword=admin')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=1')
  })

  it('parses department tree responses from the system departments endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '22222222-2222-4222-8222-222222222222',
            parentId: null,
            name: '总部',
            code: 'hq',
            status: DEPARTMENT_STATUS_ENABLED,
            sortOrder: 1,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            children: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                parentId: '22222222-2222-4222-8222-222222222222',
                name: '研发中心',
                code: 'eng',
                status: DEPARTMENT_STATUS_ENABLED,
                sortOrder: 1,
                createdAt: '2026-05-02T00:00:00.000Z',
                updatedAt: '2026-05-02T00:00:00.000Z',
                children: [],
              },
            ],
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getDepartmentTree()

    expect(result[0]?.children[0]?.code).toBe('eng')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/departments/tree')
  })

  it('parses resource tree responses from the system resources endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '44444444-4444-4444-8444-444444444444',
            parentId: null,
            type: RESOURCE_TYPE_MENU,
            name: '用户管理',
            code: 'system.users',
            path: '/system/users',
            externalUrl: null,
            openTarget: 'self',
            icon: null,
            hidden: false,
            status: RESOURCE_STATUS_ENABLED,
            sortOrder: 1,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            children: [],
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getResourceTree()

    expect(result[0]?.path).toBe('/system/users')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/resources/tree')
  })

  it('throws a stable request error with the response message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: '查询失败' }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listUsers({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      status: 500,
      message: '查询失败',
    })
  })

  it('formats unknown request errors with a fallback message', () => {
    expect(getSystemErrorMessage(new SystemRequestError(400, '请求体无效'), '加载用户失败')).toBe(
      '请求体无效',
    )
    expect(getSystemErrorMessage(new Error('boom'), '加载用户失败')).toBe('加载用户失败')
  })
})
