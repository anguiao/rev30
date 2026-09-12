import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_ACTION_HEADER, AUTH_ACTION_REFRESH } from '@rev30/contracts'
import { api, authFetch, logoutAuthSession, refreshAuthSession } from '../src/api'
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
import { session } from './helpers/session'

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

const refreshedNewerSession = {
  ...newerSession,
  accessToken: 'refreshed-newer-access-token',
}

function refreshableUnauthorizedResponse() {
  return jsonResponse(
    { message: '未授权' },
    {
      status: 401,
      headers: { [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH },
    },
  )
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

    await authFetch('/api/health/live', {
      headers: {
        authorization: 'Basic caller-token',
      },
    })

    expect(getFetchCall(fetchMock).headers.get('authorization')).toBe('Basic caller-token')
  })

  it('preserves caller headers while adding the bearer token', async () => {
    const fetchMock = createFetchMock(jsonResponse({}))
    useAuthStore().accessToken = 'access-token'

    await authFetch('/api/health/live', {
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

      await authFetch('/api/health/live', {
        credentials,
      })

      expect(getFetchCall(fetchMock).init.credentials).toBe(credentials)
    },
  )

  it('omits authorization when no access token is present', async () => {
    const fetchMock = createFetchMock(jsonResponse({}))

    await authFetch('/api/health/live')

    expect(getFetchCall(fetchMock).headers.has('authorization')).toBe(false)
  })

  it('refreshes the access token through RPC and retries refreshable unauthorized responses', async () => {
    const fetchMock = createFetchMock(
      refreshableUnauthorizedResponse(),
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
    const refreshHeaders = getFetchCall(fetchMock, 1).headers
    const retryHeaders = getFetchCall(fetchMock, 2).headers

    expect(firstHeaders.get('authorization')).toBe('Bearer access-token')
    expect(refreshHeaders.get('authorization')).toBe('Bearer access-token')
    expect(retryHeaders.get('authorization')).toBe('Bearer new-access-token')
    expect(retryHeaders.get('x-request-id')).toBe('request-id')
  })

  it('coalesces concurrent refreshable unauthorized responses into one refresh request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(refreshableUnauthorizedResponse())
      .mockResolvedValueOnce(refreshableUnauthorizedResponse())
      .mockResolvedValueOnce(jsonResponse(refreshedSession))
      .mockImplementation(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().setSession(session)

    await Promise.all([authFetch('/api/system/users'), authFetch('/api/system/profile')])

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock.mock.calls.filter(([input]) => input === '/api/auth/refresh')).toHaveLength(1)
  })

  it('does not refresh unauthorized responses without a local access token', async () => {
    const fetchMock = createFetchMock(refreshableUnauthorizedResponse())

    const response = await authFetch('/api/system/users')

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('refreshes without authorization during initial page restoration', async () => {
    const fetchMock = createFetchMock(jsonResponse(refreshedSession))

    await refreshAuthSession()

    expect(getFetchCall(fetchMock).headers.has('authorization')).toBe(false)
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
    expect(getFetchCall(fetchMock, 1).headers.get('authorization')).toBe('Bearer access-token')
  })

  it('clears the current session and logs out when refresh is unauthorized', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(refreshableUnauthorizedResponse())
      .mockResolvedValueOnce(jsonResponse({ message: '刷新失败' }, { status: 401 }))
      .mockResolvedValueOnce(emptyResponse())
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
      .fn<typeof fetch>()
      .mockResolvedValueOnce(refreshableUnauthorizedResponse())
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
      .fn<typeof fetch>()
      .mockResolvedValueOnce(refreshableUnauthorizedResponse())
      .mockResolvedValueOnce(jsonResponse(refreshedSession))
      .mockResolvedValueOnce(jsonResponse({ message: '未授权' }, { status: 401 }))
      .mockResolvedValueOnce(emptyResponse())
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

  it('does not log out a newer session after a stale unauthorized response', async () => {
    const firstResponse = createDeferred<Response>()
    const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(firstResponse.promise)
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const responsePromise = authFetch('/api/system/users')
    auth.setSession(newerSession)
    firstResponse.resolve(jsonResponse({ message: '未授权' }, { status: 401 }))

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
      .fn<typeof fetch>()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(refreshResponse.promise)
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const responsePromise = authFetch('/api/system/users')
    firstResponse.resolve(refreshableUnauthorizedResponse())
    await flushMicrotasks()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    auth.setSession(newerSession)
    refreshResponse.resolve(jsonResponse(refreshedSession))

    const response = await responsePromise

    expect(await response.json()).toEqual({ ok: true })
    expect(auth.accessToken).toBe('newer-access-token')
    expect(auth.user).toEqual(newerSession.user)
    expect(getFetchCall(fetchMock, 2).headers.get('authorization')).toBe(
      'Bearer newer-access-token',
    )
  })

  it('keeps automatic refreshes isolated by their triggering access token', async () => {
    const firstRefreshResponse = createDeferred<Response>()
    const secondRefreshResponse = createDeferred<Response>()
    const protectedRequestCounts = new Map<string, number>()
    const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const requestPath =
        typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url

      if (requestPath === '/api/auth/refresh') {
        const authorization = new Headers(init.headers).get('authorization')

        if (authorization === 'Bearer access-token') {
          return firstRefreshResponse.promise
        }
        if (authorization === 'Bearer newer-access-token') {
          return secondRefreshResponse.promise
        }

        throw new Error(`Unexpected refresh authorization: ${authorization}`)
      }

      const requestCount = (protectedRequestCounts.get(requestPath) ?? 0) + 1
      protectedRequestCounts.set(requestPath, requestCount)

      return Promise.resolve(
        requestCount === 1 ? refreshableUnauthorizedResponse() : jsonResponse({ ok: true }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const staleRequest = authFetch('/api/system/users')
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => input === '/api/auth/refresh')).toBe(true)
    })

    auth.setSession(newerSession)
    const currentRequest = authFetch('/api/system/profile')
    await vi.waitFor(() => {
      expect(protectedRequestCounts.get('/api/system/profile')).toBe(1)
    })

    firstRefreshResponse.resolve(jsonResponse(refreshedSession))
    await vi.waitFor(() => {
      const refreshCalls = fetchMock.mock.calls
        .map((_, index) => getFetchCall(fetchMock, index))
        .filter(({ url }) => url === '/api/auth/refresh')

      expect(refreshCalls).toHaveLength(2)
    })
    expect(auth.accessToken).toBe('newer-access-token')

    secondRefreshResponse.resolve(jsonResponse(refreshedNewerSession))
    await Promise.all([staleRequest, currentRequest])

    const refreshAuthorizations = fetchMock.mock.calls
      .map((_, index) => getFetchCall(fetchMock, index))
      .filter(({ url }) => url === '/api/auth/refresh')
      .map(({ headers }) => headers.get('authorization'))

    expect(refreshAuthorizations).toEqual(['Bearer access-token', 'Bearer newer-access-token'])
    expect(auth.accessToken).toBe('refreshed-newer-access-token')
    expect(auth.user).toEqual(newerSession.user)
  })

  it('does not log out a stale retry after a newer session is set', async () => {
    const retryResponse = createDeferred<Response>()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(refreshableUnauthorizedResponse())
      .mockResolvedValueOnce(jsonResponse(refreshedSession))
      .mockReturnValueOnce(retryResponse.promise)
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.setSession(session)

    const responsePromise = authFetch('/api/system/users')
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    auth.setSession(newerSession)
    retryResponse.resolve(jsonResponse({ message: '未授权' }, { status: 401 }))

    const response = await responsePromise

    expect(response.status).toBe(401)
    expect(auth.accessToken).toBe('newer-access-token')
    expect(auth.user).toEqual(newerSession.user)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('waits for an in-flight refresh before sending logout', async () => {
    const refreshResponse = createDeferred<Response>()
    const requestPaths: string[] = []
    let protectedRequestCount = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requestPath =
        typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
      requestPaths.push(requestPath)

      if (requestPath === '/api/auth/refresh') {
        return refreshResponse.promise
      }

      if (requestPath === '/api/auth/logout') {
        return emptyResponse()
      }

      protectedRequestCount += 1
      return protectedRequestCount === 1
        ? refreshableUnauthorizedResponse()
        : jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().setSession(session)

    const requestPromise = authFetch('/api/system/users')
    await vi.waitFor(() => {
      expect(requestPaths).toContain('/api/auth/refresh')
    })

    const logoutPromise = logoutAuthSession()
    await flushMicrotasks()
    expect(requestPaths).not.toContain('/api/auth/logout')

    refreshResponse.resolve(jsonResponse(refreshedSession))
    await Promise.all([requestPromise, logoutPromise])

    expect(requestPaths.indexOf('/api/auth/refresh')).toBeLessThan(
      requestPaths.indexOf('/api/auth/logout'),
    )
  })
})

describe('api client', () => {
  it('requests the health endpoint through authFetch defaults', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        service: 'rev30-server',
        status: 'alive',
      }),
    )

    await api.health.live.$get()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/health/live',
    })
    expect(getFetchCall(fetchMock).init.credentials).toBe('same-origin')
  })

  it('adds the bearer token from the auth store when present', async () => {
    const fetchMock = createFetchMock(jsonResponse({ service: 'rev30-server', status: 'alive' }))
    useAuthStore().accessToken = 'access-token'

    await api.health.live.$get()

    expect(getFetchCall(fetchMock).headers.get('authorization')).toBe('Bearer access-token')
  })
})
