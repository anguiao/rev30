import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  type DepartmentSummary,
  type RoleSummary,
} from '@rev30/contracts'
import { api, authFetch } from '../src/api'
import { useAuthStore } from '../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  getFetchCall,
  jsonResponse,
} from './helpers/fetch'
import { createTestPinia } from './helpers/pinia'
import { createDeferred } from './helpers/promise'

const session = {
  accessToken: 'access-token',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  accessCodes: ['system', 'system:user'],
  menus: [],
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    avatarId: null,
    email: null,
    phone: null,
    status: 1 as 0 | 1,
    builtIn: false,
    departments: [] as DepartmentSummary[],
    roles: [] as RoleSummary[],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

const refreshedSession = {
  ...session,
  accessToken: 'new-access-token',
}

const newerSession = {
  ...session,
  accessToken: 'newer-access-token',
  user: {
    ...session.user,
    id: 'd3ba4c56-3989-4a48-91e0-0f9e70c90be0',
    username: 'grace',
    nickname: 'Grace Hopper',
  },
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  createTestPinia()
})

describe('authFetch', () => {
  it('preserves caller authorization when an access token is present', async () => {
    const fetchMock = createFetchMock(jsonResponse({}))
    useAuthStore().accessToken = 'access-token'

    await authFetch('/api/health', {
      headers: {
        authorization: 'Basic caller-token',
      },
    })

    expect(getFetchCall(fetchMock).headers.get('authorization')).toBe('Basic caller-token')
  })

  it('preserves caller headers while adding the bearer token', async () => {
    const fetchMock = createFetchMock(jsonResponse({}))
    useAuthStore().accessToken = 'access-token'

    await authFetch('/api/health', {
      headers: {
        'x-request-id': 'request-id',
      },
    })

    const { headers } = getFetchCall(fetchMock)
    expect(headers.get('x-request-id')).toBe('request-id')
    expect(headers.get('authorization')).toBe('Bearer access-token')
  })

  it.each(['include', 'omit'] as const)(
    'preserves explicit %s credentials',
    async (credentials) => {
      const fetchMock = createFetchMock(jsonResponse({}))

      await authFetch('/api/health', {
        credentials,
      })

      expect(getFetchCall(fetchMock).init.credentials).toBe(credentials)
    },
  )

  it('omits authorization when no access token is present', async () => {
    const fetchMock = createFetchMock(jsonResponse({}))

    await authFetch('/api/health')

    expect(getFetchCall(fetchMock).headers.has('authorization')).toBe(false)
  })

  it('refreshes the access token through RPC and retries refreshable unauthorized responses', async () => {
    const fetchMock = createFetchMock(
      jsonResponse(
        {
          message: '未授权',
        },
        {
          status: 401,
          headers: {
            [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
          },
        },
      ),
      jsonResponse(refreshedSession),
      jsonResponse({ ok: true }),
    )
    const auth = useAuthStore()
    auth.setSession(session)

    const response = await authFetch('/api/system/users', {
      headers: {
        'x-request-id': 'request-id',
      },
    })

    expect(await response.json()).toEqual({ ok: true })
    expect(auth.accessToken).toBe('new-access-token')
    expect(auth.user).toEqual(refreshedSession.user)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/refresh',
      expect.objectContaining({
        credentials: 'same-origin',
        method: 'POST',
      }),
    )

    const firstHeaders = getFetchCall(fetchMock, 0).headers
    const retryHeaders = getFetchCall(fetchMock, 2).headers

    expect(firstHeaders.get('authorization')).toBe('Bearer access-token')
    expect(retryHeaders.get('authorization')).toBe('Bearer new-access-token')
    expect(retryHeaders.get('x-request-id')).toBe('request-id')
  })

  it('coalesces concurrent refreshable unauthorized responses into one refresh request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: '未授权' }), {
          status: 401,
          headers: {
            [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: '未授权' }), {
          status: 401,
          headers: {
            [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(refreshedSession)))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().setSession(session)

    await Promise.all([authFetch('/api/system/users'), authFetch('/api/system/profile')])

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock.mock.calls.filter(([input]) => input === '/api/auth/refresh')).toHaveLength(1)
  })

  it('does not refresh unauthorized responses without a local access token', async () => {
    const fetchMock = createFetchMock(
      jsonResponse(
        {
          message: '未授权',
        },
        {
          status: 401,
          headers: {
            [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
          },
        },
      ),
    )

    const response = await authFetch('/api/system/users')

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('clears the current session and logs out for non-refreshable unauthorized responses', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ message: '未授权' }, { status: 401 }),
      emptyResponse(),
    )
    const auth = useAuthStore()
    auth.setSession(session)

    const response = await authFetch('/api/system/users')

    expect(response.status).toBe(401)
    expect(auth.isAuthenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('clears the current session and logs out when refresh is unauthorized', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: '未授权' }), {
          status: 401,
          headers: {
            [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: '刷新失败' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const response = await authFetch('/api/system/users')

    expect(response.status).toBe(401)
    expect(auth.isAuthenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('keeps the current session when refresh fails transiently', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: '未授权' }), {
          status: 401,
          headers: {
            [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
          },
        }),
      )
      .mockRejectedValueOnce(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const response = await authFetch('/api/system/users')

    expect(response.status).toBe(401)
    expect(auth.accessToken).toBe('access-token')
    expect(auth.user).toEqual(session.user)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('clears the current session and logs out when retry remains unauthorized', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: '未授权' }), {
          status: 401,
          headers: {
            [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(refreshedSession)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: '未授权' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const response = await authFetch('/api/system/users')

    expect(response.status).toBe(401)
    expect(auth.isAuthenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('does not clear a newer session after a stale unauthorized response', async () => {
    const firstResponse = createDeferred<Response>()
    const fetchMock = vi.fn().mockReturnValueOnce(firstResponse.promise)
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const responsePromise = authFetch('/api/system/users')
    auth.setSession(newerSession)
    firstResponse.resolve(new Response(JSON.stringify({ message: '未授权' }), { status: 401 }))

    const response = await responsePromise

    expect(response.status).toBe(401)
    expect(auth.accessToken).toBe('newer-access-token')
    expect(auth.user).toEqual(newerSession.user)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not overwrite a newer session with a stale refresh result', async () => {
    const firstResponse = createDeferred<Response>()
    const refreshResponse = createDeferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(refreshResponse.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const responsePromise = authFetch('/api/system/users')
    firstResponse.resolve(
      new Response(JSON.stringify({ message: '未授权' }), {
        status: 401,
        headers: {
          [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
        },
      }),
    )
    await flushMicrotasks()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    auth.setSession(newerSession)
    refreshResponse.resolve(new Response(JSON.stringify(refreshedSession)))

    const response = await responsePromise
    const [, retryInit] = fetchMock.mock.calls[2] as [RequestInfo | URL, RequestInit]

    expect(await response.json()).toEqual({ ok: true })
    expect(auth.accessToken).toBe('newer-access-token')
    expect(auth.user).toEqual(newerSession.user)
    expect(new Headers(retryInit.headers).get('authorization')).toBe('Bearer newer-access-token')
  })
})

describe('api client', () => {
  it('requests the health endpoint through authFetch defaults', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        service: 'rev30-server',
        status: 'ok',
      }),
    )

    await api.health.$get()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/health',
    })
    expect(getFetchCall(fetchMock).init.credentials).toBe('same-origin')
  })

  it('adds the bearer token from the auth store when present', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ service: 'rev30-server', status: 'ok' })))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await api.health.$get()

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-token')
  })
})
