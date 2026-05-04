import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  RESOURCE_TYPE_MENU,
  type DepartmentSummary,
  type RoleSummary,
} from '@rev30/shared'
import { api, authFetch } from '../src/api'
import { useAuthStore } from '../src/stores/auth'

const session = {
  accessToken: 'access-token',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: 1 as 0 | 1,
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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return {
    promise,
    resolve,
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authFetch', () => {
  it('preserves caller authorization when an access token is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await authFetch('/api/health', {
      headers: {
        authorization: 'Basic caller-token',
      },
    })

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(new Headers(init.headers).get('authorization')).toBe('Basic caller-token')
  })

  it('preserves caller headers while adding the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    await authFetch('/api/health', {
      headers: {
        'x-request-id': 'request-id',
      },
    })

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('x-request-id')).toBe('request-id')
    expect(headers.get('authorization')).toBe('Bearer access-token')
  })

  it.each(['include', 'omit'] as const)(
    'preserves explicit %s credentials',
    async (credentials) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
      vi.stubGlobal('fetch', fetchMock)

      await authFetch('/api/health', {
        credentials,
      })

      const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
      expect(init.credentials).toBe(credentials)
    },
  )

  it('omits authorization when no access token is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/health')

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(new Headers(init.headers).has('authorization')).toBe(false)
  })

  it('refreshes the access token through RPC and retries refreshable unauthorized responses', async () => {
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
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

    const [, firstInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    const [, retryInit] = fetchMock.mock.calls[2] as [RequestInfo | URL, RequestInit]
    const firstHeaders = new Headers(firstInit.headers)
    const retryHeaders = new Headers(retryInit.headers)

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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: '未授权' }), {
        status: 401,
        headers: {
          [AUTH_ACTION_HEADER]: AUTH_ACTION_REFRESH,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await authFetch('/api/system/users')

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledOnce()
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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          service: 'rev30-server',
          status: 'ok',
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await api.health.$get()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        method: 'GET',
      }),
    )
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(init.credentials).toBe('same-origin')
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

  it('requests nested user endpoints with query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [],
          total: 0,
          page: 2,
          pageSize: 10,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await api.system.users.$get({
      query: {
        page: '2',
        pageSize: '10',
        keyword: 'ada',
        status: '1',
      },
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/users?page=2&pageSize=10&keyword=ada&status=1',
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })

  it('requests nested department endpoints with query params', async () => {
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

    await api.system.departments.$get({
      query: {
        keyword: 'eng',
        status: '1',
        parentId: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
        page: '1',
        pageSize: '20',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/departments?keyword=eng&status=1&parentId=4be2dfda-2fd6-4ee5-b06b-c551328bc343&page=1&pageSize=20',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('exposes typed system role endpoints', () => {
    expect(api.system.roles.$get).toEqual(expect.any(Function))
    expect(api.system.roles[':id'].$get).toEqual(expect.any(Function))
    expect(api.system.roles.$post).toEqual(expect.any(Function))
  })

  it('types role query and create input', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    void api.system.roles.$get({
      query: {
        page: '1',
        pageSize: '20',
        keyword: 'admin',
        status: '1',
      },
    })

    void api.system.roles.$post({
      json: {
        name: 'Administrator',
        code: 'admin',
        resourceIds: ['4be2dfda-2fd6-4ee5-b06b-c551328bc343'],
      },
    })
  })

  it('types nested user query params', () => {
    const invalidQuery: Parameters<typeof api.system.users.$get>[0] = {
      query: {
        // @ts-expect-error Unknown query params should not be accepted by the RPC contract.
        unknown: 'value',
      },
    }

    void invalidQuery
  })

  it('types user create input with department ids', () => {
    const validBody: Parameters<typeof api.system.users.$post>[0] = {
      json: {
        username: 'department-client',
        nickname: 'Department Client',
        email: null,
        phone: null,
        departmentIds: ['4be2dfda-2fd6-4ee5-b06b-c551328bc343'],
      },
    }

    void validBody
  })

  it('types user create input with role ids', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    void api.system.users.$post({
      json: {
        username: 'role-user',
        nickname: 'Role User',
        roleIds: ['875dd9cb-488b-43d7-a55f-6db070a8e83f'],
      },
    })
  })

  it('requests nested resource endpoints with query params', async () => {
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

    await api.system.resources.$get({
      query: {
        keyword: 'user',
        type: RESOURCE_TYPE_MENU,
        status: '1',
        parentId: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
        page: '1',
        pageSize: '20',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/resources?keyword=user&type=menu&status=1&parentId=4be2dfda-2fd6-4ee5-b06b-c551328bc343&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })

  it('types nested resource query params', () => {
    const invalidQuery: Parameters<typeof api.system.resources.$get>[0] = {
      query: {
        // @ts-expect-error Unknown query params should not be accepted by the RPC contract.
        unknown: 'value',
      },
    }

    void invalidQuery
  })

  it('types resource create input with menu fields', () => {
    const validBody: Parameters<typeof api.system.resources.$post>[0] = {
      json: {
        type: RESOURCE_TYPE_MENU,
        name: '用户管理',
        code: 'system:user',
        path: '/system/users',
        externalUrl: null,
        icon: null,
      },
    }

    void validBody
  })
})
