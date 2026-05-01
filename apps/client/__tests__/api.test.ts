import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, authFetch } from '../src/api'
import { useAuthStore } from '../src/stores/auth'

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

  it('types nested user query params', () => {
    const invalidQuery: Parameters<typeof api.system.users.$get>[0] = {
      query: {
        // @ts-expect-error Unknown query params should not be accepted by the RPC contract.
        unknown: 'value',
      },
    }

    void invalidQuery
  })
})
