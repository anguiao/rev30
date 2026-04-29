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
})

describe('server RPC contract boundary', () => {
  it('uses a pure type contract for client-facing server imports', () => {
    expect(serverPackage.exports['.']).toEqual({
      types: './src/rpc.ts',
      default: './src/app.ts',
    })
    expect(tsconfig.compilerOptions.paths['@rev30/server']).toEqual(['apps/server/src/rpc.ts'])
  })
})
