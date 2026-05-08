import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import {
  AuthRequestError,
  getAuthErrorMessage,
  logout,
  parseAuthError,
  parseAuthSession,
  updateMyPassword,
  updateMyProfile,
  register,
} from '../../../src/features/auth/requests'

const tokenBody = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  accessCodes: [],
  menus: [],
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    builtIn: false,
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
        new Response(JSON.stringify({ field: 123, message: 123 }), {
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

  it('updates my profile through the Hono RPC client with parsed input', async () => {
    const responseBody = {
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '18888888888',
      status: USER_STATUS_ENABLED,
      builtIn: false,
      departments: [],
      roles: [],
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    }

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody)))
    vi.stubGlobal('fetch', fetchMock)

    const result = await updateMyProfile({
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '18888888888',
    })

    expect(result).toEqual(responseBody)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me/profile',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '18888888888',
    })
  })

  it('parses auth request errors for my profile updates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ field: 'nickname', message: '昵称过长' }), {
        status: 400,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateMyProfile({
        nickname: 'Ada Lovelace',
        email: null,
        phone: null,
      }),
    ).rejects.toMatchObject({
      status: 400,
      field: 'nickname',
      message: '昵称过长',
    })
  })

  it('rejects malformed update profile responses that do not match the User schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
          username: 'ada',
          status: 'enabled',
          builtIn: false,
          departments: [],
          roles: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateMyProfile({
        nickname: 'Ada Lovelace',
        email: null,
        phone: null,
      }),
    ).rejects.toThrow()
  })

  it('validates profile update payloads before sending requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateMyProfile({
        nickname: '',
        email: null,
        phone: null,
      } as never),
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('updates my password through the Hono RPC client with parsed input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await updateMyPassword({
      currentPassword: 'password123',
      newPassword: 'password456',
    })

    expect(result).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me/password',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      currentPassword: 'password123',
      newPassword: 'password456',
    })
  })

  it('reuses parseAuthError for profile and password request failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: '当前密码错误' }), {
        status: 400,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateMyPassword({
        currentPassword: 'password123',
        newPassword: 'password456',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: '当前密码错误',
    })
  })

  it('validates password update payloads before sending requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateMyPassword({
        currentPassword: 'short',
        newPassword: 'another',
      } as never),
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('extracts auth error messages and falls back for unknown errors', async () => {
    expect(getAuthErrorMessage(new AuthRequestError(401, '会话已过期'), '操作失败')).toBe('会话已过期')
    expect(getAuthErrorMessage(new Error('boom'), '操作失败')).toBe('操作失败')
  })
})
