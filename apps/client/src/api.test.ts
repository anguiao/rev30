import { afterEach, describe, expect, it, vi } from 'vitest'
import serverPackage from '../../server/package.json'
import tsconfig from '../../../tsconfig.base.json'
import { api } from './api'

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the health endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          service: 'rev30-server',
          status: 'ok',
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await api.health.$get()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        method: 'GET',
      }),
    )
    await expect(response.json()).resolves.toEqual({
      service: 'rev30-server',
      status: 'ok',
    })
  })

  it('requests nested system user endpoints', async () => {
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

    const response = await api.system.users.$get()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/users',
      expect.objectContaining({
        method: 'GET',
      }),
    )
    await expect(response.json()).resolves.toEqual({
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
  })

  it('requests nested system user endpoints with query params', async () => {
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

    const response = await api.system.users.$get({
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
    await expect(response.json()).resolves.toEqual({
      list: [],
      total: 0,
      page: 2,
      pageSize: 10,
    })
  })

  it('types nested system user query params', () => {
    const invalidQuery: Parameters<typeof api.system.users.$get>[0] = {
      query: {
        // @ts-expect-error Unknown query params should not be accepted by the RPC contract.
        unknown: 'value',
      },
    }

    void invalidQuery
  })
})

describe('server RPC contract boundary', () => {
  it('uses the real app routes for client-facing server imports', () => {
    expect(serverPackage.exports['.']).toEqual({
      types: './src/app.ts',
      default: './src/app.ts',
    })
    expect(tsconfig.compilerOptions.paths['@rev30/server']).toEqual(['apps/server/src/app.ts'])
  })
})
