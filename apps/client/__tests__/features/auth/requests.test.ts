import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import {
  AuthRequestError,
  logout,
  parseAuthError,
  parseAuthSession,
  register,
} from '../../../src/features/auth/requests'

const tokenBody = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    departments: [],
    roles: [],
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

  it('falls back when auth error responses violate the shared schema', async () => {
    await expect(
      parseAuthError(
        new Response(JSON.stringify({ field: 'role', message: 'role is not unique' }), {
          status: 409,
        }),
      ),
    ).resolves.toMatchObject({
      status: 409,
      message: '请求失败',
      field: undefined,
    })
  })

  it('keeps a stable message when the server response is not json', async () => {
    await expect(parseAuthError(new Response('nope', { status: 500 }))).resolves.toMatchObject({
      status: 500,
      message: '请求失败',
    })
  })

  it('exposes status and field on AuthRequestError', () => {
    const error = new AuthRequestError(401, 'Invalid username or password')

    expect(error.status).toBe(401)
    expect(error.message).toBe('Invalid username or password')
    expect(error.field).toBeUndefined()
  })

  it('registers through the Hono RPC client with parsed input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenBody)))
    vi.stubGlobal('fetch', fetchMock)

    await register({
      username: 'ada',
      nickname: 'Ada Lovelace',
      password: 'password123',
      email: null,
      phone: null,
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

  it('logs out through the Hono RPC client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await logout()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})
