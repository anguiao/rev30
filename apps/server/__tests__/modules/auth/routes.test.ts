import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthInvalidCredentialsError,
  AuthInvalidCurrentPasswordError,
  AuthInvalidRefreshTokenError,
} from '../../../src/modules/auth/errors'
import { createAuthRoutes } from '../../../src/modules/auth/routes'
import { UserConflictError } from '../../../src/modules/system/users/errors'

const authUser = {
  id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
  username: 'ada',
  nickname: 'Ada Lovelace',
  email: null,
  phone: null,
  status: 1,
  departments: [],
  roles: [],
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-06T00:00:00.000Z',
}

const mocks = vi.hoisted(() => {
  const service = {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    refresh: vi.fn(),
    register: vi.fn(),
    updatePassword: vi.fn(),
    updateProfile: vi.fn(),
  }
  const authMiddleware = vi.fn(async (c: Context, next: Next) => {
    const context = c as unknown as { set: (key: string, value: unknown) => void }

    context.set('currentUser', {
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: null,
      phone: null,
      status: 1,
      departments: [],
      roles: [],
      createdAt: '2026-05-06T00:00:00.000Z',
      updatedAt: '2026-05-06T00:00:00.000Z',
    })
    context.set('accessCodes', ['system:user:list'])
    context.set('menus', [{ code: 'system:user' }])

    await next()
  })

  return {
    authMiddleware,
    createAuthMiddleware: vi.fn(() => authMiddleware),
    createAuthService: vi.fn(() => service),
    service,
  }
})

vi.mock('../../../src/modules/auth/service', () => ({
  createAuthService: mocks.createAuthService,
}))

vi.mock('../../../src/middleware/auth', () => ({
  createAuthMiddleware: mocks.createAuthMiddleware,
}))

function createTestApp() {
  return new Hono().route('/api/auth', createAuthRoutes({} as never))
}

function createSession(refreshToken: string) {
  return {
    accessToken: `${refreshToken}-access-token`,
    refreshToken,
    tokenType: 'Bearer' as const,
    expiresIn: 900,
    user: authUser,
    accessCodes: [],
    menus: [],
  }
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.createAuthService.mockReturnValue(mocks.service)
    mocks.createAuthMiddleware.mockReturnValue(mocks.authMiddleware)
    mocks.service.register.mockResolvedValue(createSession('register-refresh-token'))
    mocks.service.login.mockResolvedValue(createSession('login-refresh-token'))
    mocks.service.refresh.mockResolvedValue(createSession('rotated-refresh-token'))
    mocks.service.logout.mockResolvedValue(undefined)
    mocks.service.updateProfile.mockResolvedValue({
      ...authUser,
      nickname: 'Updated Nickname',
      email: 'updated@example.com',
    })
    mocks.service.updatePassword.mockResolvedValue(undefined)
  })

  it('delegates register requests while keeping refresh tokens in cookies only', async () => {
    const app = createTestApp()

    const registerResponse = await app.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'ada',
        password: 'secret-password',
        nickname: 'Ada Lovelace',
      }),
      headers: { 'content-type': 'application/json' },
    })
    const registerBody = await readJson(registerResponse)

    expect(registerResponse.status).toBe(201)
    expect(registerResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(registerBody).not.toHaveProperty('refreshToken')
    expect(mocks.service.register).toHaveBeenCalledWith({
      username: 'ada',
      password: 'secret-password',
      nickname: 'Ada Lovelace',
    })
  })

  it('delegates login requests while keeping refresh tokens in cookies only', async () => {
    const app = createTestApp()

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'ada',
        password: 'secret-password',
      }),
      headers: { 'content-type': 'application/json' },
    })
    const loginBody = await readJson(loginResponse)

    expect(loginResponse.status).toBe(200)
    expect(loginResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(loginBody).not.toHaveProperty('refreshToken')
    expect(mocks.service.login).toHaveBeenCalledWith({
      username: 'ada',
      password: 'secret-password',
    })
  })

  it('delegates refresh requests while keeping refresh tokens in cookies only', async () => {
    const app = createTestApp()

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { cookie: 'refresh_token=old-refresh-token' },
    })
    const refreshBody = await readJson(refreshResponse)

    expect(refreshResponse.status).toBe(200)
    expect(refreshResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(refreshBody).not.toHaveProperty('refreshToken')
    expect(mocks.service.refresh).toHaveBeenCalledWith('old-refresh-token')
  })

  it('clears the refresh cookie during logout even when revoke fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.service.logout.mockRejectedValue(new Error('revoke failed'))

    try {
      const app = createTestApp()
      const response = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { cookie: 'refresh_token=current-refresh-token' },
      })

      expect(response.status).toBe(500)
      expect(response.headers.get('set-cookie')).toContain('refresh_token=')
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
      expect(mocks.service.logout).toHaveBeenCalledWith('current-refresh-token')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('reads refresh tokens from cookies only', async () => {
    mocks.service.refresh.mockRejectedValueOnce(new AuthInvalidRefreshTokenError())
    const app = createTestApp()

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: 'body-refresh-token',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(refreshResponse.status).toBe(401)
    expect(mocks.service.refresh).toHaveBeenCalledWith(undefined)
  })

  it('logs out successfully without a refresh cookie', async () => {
    const app = createTestApp()

    const emptyLogoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
    })

    expect(emptyLogoutResponse.status).toBe(204)
    expect(emptyLogoutResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(emptyLogoutResponse.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(mocks.service.logout).toHaveBeenCalledWith(undefined)
  })

  it('reads logout tokens from cookies only', async () => {
    const app = createTestApp()

    const cookieLogoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: 'body-refresh-token',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: 'refresh_token=cookie-refresh-token',
      },
    })

    expect(cookieLogoutResponse.status).toBe(204)
    expect(mocks.service.logout).toHaveBeenLastCalledWith('cookie-refresh-token')
  })

  it('uses authenticated context for current-user routes', async () => {
    const app = createTestApp()

    const meResponse = await app.request('/api/auth/me')
    expect(meResponse.status).toBe(200)
    expect(await meResponse.json()).toEqual({
      user: authUser,
      accessCodes: ['system:user:list'],
      menus: [{ code: 'system:user' }],
    })
  })

  it('delegates profile updates for the authenticated user', async () => {
    const app = createTestApp()

    const profileResponse = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Updated Nickname',
        email: 'updated@example.com',
        phone: null,
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(profileResponse.status).toBe(200)
    expect(mocks.service.updateProfile).toHaveBeenCalledWith(authUser.id, {
      nickname: 'Updated Nickname',
      email: 'updated@example.com',
      phone: null,
    })
  })

  it('delegates password updates with the current refresh cookie', async () => {
    const app = createTestApp()

    const passwordResponse = await app.request('/api/auth/me/password', {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: 'refresh_token=current-refresh-token',
      },
    })

    expect(passwordResponse.status).toBe(204)
    expect(mocks.service.updatePassword).toHaveBeenCalledWith(
      authUser.id,
      {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      },
      'current-refresh-token',
    )
  })

  it('returns register validation errors before calling the auth service', async () => {
    const app = createTestApp()

    const registerResponse = await app.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'ada',
        password: 'short',
        nickname: 'Ada Lovelace',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(registerResponse.status).toBe(400)
    expect(await registerResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.register).not.toHaveBeenCalled()
  })

  it('returns login validation errors before calling the auth service', async () => {
    const app = createTestApp()

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: '   ',
        password: 'secret-password',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(loginResponse.status).toBe(400)
    expect(await loginResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.login).not.toHaveBeenCalled()
  })

  it('returns profile validation errors before calling the auth service', async () => {
    const app = createTestApp()

    const profileResponse = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        username: 'ignored',
        nickname: 'Updated Nickname',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(profileResponse.status).toBe(400)
    expect(await profileResponse.json()).toEqual({ message: '请求体无效' })
    expect(mocks.service.updateProfile).not.toHaveBeenCalled()
  })

  it('maps register conflict errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.register.mockRejectedValueOnce(new UserConflictError('username'))
    const conflictResponse = await app.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'ada',
        password: 'secret-password',
        nickname: 'Ada Lovelace',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(conflictResponse.status).toBe(409)
    expect(await conflictResponse.json()).toEqual({
      field: 'username',
      message: '用户名已存在',
    })
  })

  it('maps invalid login credentials to route responses', async () => {
    const app = createTestApp()

    mocks.service.login.mockRejectedValueOnce(new AuthInvalidCredentialsError())
    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'ada',
        password: 'secret-password',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(loginResponse.status).toBe(401)
    expect(await loginResponse.json()).toEqual({ message: '用户名或密码错误' })
  })

  it('maps invalid refresh tokens to route responses', async () => {
    const app = createTestApp()

    mocks.service.refresh.mockRejectedValueOnce(new AuthInvalidRefreshTokenError())
    const refreshResponse = await app.request('/api/auth/refresh', { method: 'POST' })
    expect(refreshResponse.status).toBe(401)
    expect(await refreshResponse.json()).toEqual({ message: '刷新令牌无效' })
  })

  it('maps invalid current passwords to route responses', async () => {
    const app = createTestApp()

    mocks.service.updatePassword.mockRejectedValueOnce(new AuthInvalidCurrentPasswordError())
    const passwordResponse = await app.request('/api/auth/me/password', {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(passwordResponse.status).toBe(400)
    expect(await passwordResponse.json()).toEqual({
      field: 'currentPassword',
      message: '当前密码错误',
    })
  })
})
