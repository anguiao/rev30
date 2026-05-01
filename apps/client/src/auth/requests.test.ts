import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { AuthRequestError, logout, parseAuthError, parseAuthSession, register } from './requests'

const tokenBody = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

describe('auth requests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses auth token responses through the shared schema', async () => {
    await expect(parseAuthSession(new Response(JSON.stringify(tokenBody)))).resolves.toEqual(
      tokenBody,
    )
  })

  it('maps auth error responses to a typed error', async () => {
    await expect(
      parseAuthError(
        new Response(JSON.stringify({ field: 'username', message: 'username already exists' }), {
          status: 409,
        }),
      ),
    ).resolves.toMatchObject({
      status: 409,
      field: 'username',
      message: 'username already exists',
    })
  })

  it('ignores auth error fields outside the user unique field whitelist', async () => {
    const error = await parseAuthError(
      new Response(JSON.stringify({ field: 'role', message: 'role is not unique' }), {
        status: 409,
      }),
    )

    expect(error.status).toBe(409)
    expect(error.message).toBe('role is not unique')
    expect(error.field).toBeUndefined()
  })

  it('keeps a stable message when the server response is not json', async () => {
    await expect(parseAuthError(new Response('nope', { status: 500 }))).resolves.toMatchObject({
      status: 500,
      message: 'Request failed',
    })
  })

  it('exposes status and field on AuthRequestError', () => {
    const error = new AuthRequestError(401, 'Invalid username or password')

    expect(error.status).toBe(401)
    expect(error.message).toBe('Invalid username or password')
    expect(error.field).toBeUndefined()
  })

  it('registers through the Hono RPC client and normalizes empty contact fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenBody)))
    vi.stubGlobal('fetch', fetchMock)

    await register({
      username: 'ada',
      nickname: 'Ada Lovelace',
      password: 'password123',
      email: '',
      phone: '',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        method: 'POST',
      }),
    )

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      username: 'ada',
      nickname: 'Ada Lovelace',
      password: 'password123',
      email: null,
      phone: null,
    })
  })

  it.each([400, 401])('tolerates logout %i responses', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid refresh token' }), {
        status,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(logout()).resolves.toBeUndefined()
  })

  it('rejects other failed logout responses as auth request errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'server exploded' }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(logout()).rejects.toMatchObject({
      status: 500,
      message: 'server exploded',
    })
  })
})
