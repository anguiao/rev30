// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import {
  SystemRequestError,
  getSystemErrorMessage,
  listUsers,
} from '../../../src/features/system/requests'
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
