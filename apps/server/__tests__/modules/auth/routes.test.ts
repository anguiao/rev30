import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  USER_STATUS_DISABLED,
  type AuthTokenResponse,
} from '@rev30/shared'
import {
  authPasswordCredentials,
  departments,
  roles,
  systemResources,
  userDepartments,
  userRoles,
  users,
} from '../../../src/db/schema'
import { createTestDb } from '../../helpers/db'
import { verifyPassword } from '../../../src/modules/auth/password'
import { createAuthRoutes } from '../../../src/modules/auth/routes'
import { readAuthConfig } from '../../../src/modules/auth/config'
import { createTokenPair } from '../../../src/modules/auth/tokens'

type ErrorResponse = {
  message: string
  field?: string
}

type AuthLoginResponse = AuthTokenResponse | ErrorResponse

type ResourceInsert = {
  code: string
  name: string
  type: string
  parentId: string | null
  path: string | null
  externalUrl: string | null
  openTarget: string
  icon: string | null
  hidden: boolean
  status: number
  sortOrder: number
}

const now = new Date('2026-05-06T00:00:00.000Z')

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/auth', createAuthRoutes(database))
}

function getRefreshTokenCookie(response: Response) {
  return response.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1]
}

async function createResource(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: ResourceInsert,
) {
  const [resource] = await database
    .insert(systemResources)
    .values({
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!resource) {
    throw new Error(`Expected resource ${input.code}`)
  }

  return resource
}

async function register(app: Hono, body = {}) {
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'ada',
      password: 'secret-password',
      nickname: 'Ada Lovelace',
      ...body,
    }),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body: (await response.json()) as AuthTokenResponse,
    refreshToken: getRefreshTokenCookie(response),
    response,
  }
}

async function login(app: Hono, body = {}) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: 'ada',
      password: 'secret-password',
      ...body,
    }),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body: (await response.json()) as AuthLoginResponse,
    response,
  }
}

describe('auth routes', () => {
  it('registers users with a password credential, token response, and refresh cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body, refreshToken, response } = await register(app, {
      email: 'ada@example.com',
      phone: '10000000001',
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('set-cookie')).toContain('refresh_token=')
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        username: 'ada',
        nickname: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '10000000001',
        departments: [],
        roles: [],
      },
    })
    expect(body.accessToken).toEqual(expect.any(String))
    expect(body.accessCodes).toEqual([])
    expect(body.menus).toEqual([])
    expect(body).not.toHaveProperty('refreshToken')
    expect(refreshToken).toEqual(expect.any(String))

    const storedUsers = await database.select().from(users).where(eq(users.id, body.user.id))
    expect(storedUsers).toHaveLength(1)
    const storedCredentials = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, body.user.id))

    expect(storedCredentials).toHaveLength(1)
    expect(storedCredentials[0]?.passwordHash).not.toBe('secret-password')
    await expect(
      verifyPassword('secret-password', storedCredentials[0]?.passwordHash ?? ''),
    ).resolves.toBe(true)
  })

  it('returns conflict when registering duplicate usernames', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    await register(app)
    const duplicate = await register(app, {
      nickname: 'Duplicate Ada',
    })

    expect(duplicate.response.status).toBe(409)
    expect(duplicate.body).toMatchObject({
      field: 'username',
      message: '用户名已存在',
    })
  })

  it('logs in with username and password', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    await register(app)
    const { body: responseBody, response } = await login(app)
    const body = responseBody as AuthTokenResponse

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('refresh_token=')
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        username: 'ada',
        departments: [],
        roles: [],
      },
    })
    expect(body.accessCodes).toEqual([])
    expect(body.menus).toEqual([])
    expect(body).not.toHaveProperty('refreshToken')
  })

  it('returns a uniform credentials error for wrong passwords and disabled users', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const registered = await register(app)
    const wrongPassword = await login(app, {
      password: 'wrong-password',
    })

    expect(wrongPassword.response.status).toBe(401)
    expect(wrongPassword.body).toEqual({
      message: '用户名或密码错误',
    })

    await database
      .update(users)
      .set({
        status: USER_STATUS_DISABLED,
      })
      .where(eq(users.id, registered.body.user.id))

    const disabled = await login(app)

    expect(disabled.response.status).toBe(401)
    expect(disabled.body).toEqual({
      message: '用户名或密码错误',
    })
  })

  it('returns role summaries on login', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app, {
      username: 'role-login-user',
      nickname: 'Role Login User',
      password: 'secret-password',
    })
    const now = new Date()

    const [role] = await database
      .insert(roles)
      .values({
        id: randomUUID(),
        name: 'Manager',
        code: 'manager',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!role) {
      throw new Error('Expected role')
    }

    await database.insert(userRoles).values({
      userId: registered.body.user.id,
      roleId: role.id,
      createdAt: now,
    })

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'role-login-user',
        password: 'secret-password',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const body = (await response.json()) as AuthTokenResponse

    expect(response.status).toBe(200)
    expect(body.accessCodes).toEqual([])
    expect(body.menus).toEqual([])
    expect(body.user.roles).toEqual([
      {
        id: role.id,
        name: 'Manager',
        code: 'manager',
      },
    ])
  })

  it('returns admin access codes and menus on login', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app, {
      username: 'admin-login',
      nickname: 'Admin Login',
      password: 'secret-password',
    })
    const existingAdminRole = await database
      .select()
      .from(roles)
      .where(eq(roles.code, 'admin'))
      .then((rows) => rows[0])

    const adminRole =
      existingAdminRole ??
      (await database
        .insert(roles)
        .values({
          id: randomUUID(),
          name: 'Administrator',
          code: 'admin',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .then((rows) => rows[0]))

    if (!adminRole) {
      throw new Error('Expected admin role')
    }

    const prefix = randomUUID()

    const systemMenu = await createResource(database, {
      code: `${prefix}-system`,
      name: 'System',
      type: RESOURCE_TYPE_DIRECTORY,
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: 'self',
      icon: 'lucide:settings',
      hidden: false,
      status: 1,
      sortOrder: 0,
    })

    const userMenu = await createResource(database, {
      code: `${prefix}-system:user`,
      name: 'Users',
      type: RESOURCE_TYPE_MENU,
      parentId: systemMenu.id,
      path: '/system/users',
      externalUrl: null,
      openTarget: 'self',
      icon: 'lucide:users',
      hidden: false,
      status: 1,
      sortOrder: 0,
    })

    await createResource(database, {
      code: `${prefix}-system:user:list`,
      name: 'View Users',
      type: RESOURCE_TYPE_ACTION,
      parentId: userMenu.id,
      path: null,
      externalUrl: null,
      openTarget: 'self',
      icon: null,
      hidden: false,
      status: 1,
      sortOrder: 0,
    })

    await database.insert(userRoles).values({
      userId: registered.body.user.id,
      roleId: adminRole.id,
      createdAt: now,
    })

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin-login',
        password: 'secret-password',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const body = (await response.json()) as AuthTokenResponse

    expect(response.status).toBe(200)
    expect(body.accessCodes).toContain(`${prefix}-system`)
    expect(body.accessCodes).toContain(`${prefix}-system:user`)
    expect(body.accessCodes).toContain(`${prefix}-system:user:list`)
    expect(body.menus.flatMap((node) => node.children.map((child) => child.code))).toContain(
      `${prefix}-system:user`,
    )
  })

  it('returns stable request body errors for invalid login and registration bodies', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const invalidRegister = await register(app, {
      password: 'short',
    })

    expect(invalidRegister.response.status).toBe(400)
    expect(invalidRegister.body).toEqual({
      message: '请求体无效',
    })

    const invalidLogin = await login(app, {
      username: '   ',
    })

    expect(invalidLogin.response.status).toBe(400)
    expect(invalidLogin.body).toEqual({
      message: '请求体无效',
    })
  })

  it('rotates refresh tokens and rejects reuse of the old refresh token', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)
    const oldRefreshToken = registered.refreshToken

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${oldRefreshToken}`,
      },
    })
    const refreshBody = (await refreshResponse.json()) as AuthTokenResponse
    const newRefreshToken = getRefreshTokenCookie(refreshResponse)

    expect(refreshResponse.status).toBe(200)
    expect(refreshResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(refreshBody).not.toHaveProperty('refreshToken')
    expect(refreshBody.accessCodes).toEqual([])
    expect(refreshBody.menus).toEqual([])
    expect(newRefreshToken).toEqual(expect.any(String))
    expect(newRefreshToken).not.toBe(oldRefreshToken)

    const reuseResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${oldRefreshToken}`,
      },
    })
    const reuseBody = (await reuseResponse.json()) as ErrorResponse

    expect(reuseResponse.status).toBe(401)
    expect(reuseBody).toEqual({
      message: '刷新令牌无效',
    })
  })

  it('refreshes from the refresh cookie when no body token is provided', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${registered.refreshToken}`,
      },
    })
    const refreshBody = (await refreshResponse.json()) as AuthTokenResponse

    expect(refreshResponse.status).toBe(200)
    expect(refreshBody.user.id).toBe(registered.body.user.id)
    expect(refreshBody.accessCodes).toEqual([])
    expect(refreshBody.menus).toEqual([])
    expect(refreshBody.user.departments).toEqual([])
    expect(refreshBody.user.roles).toEqual([])
    expect(refreshBody).not.toHaveProperty('refreshToken')
    expect(getRefreshTokenCookie(refreshResponse)).not.toBe(registered.refreshToken)
  })

  it('does not accept body refresh tokens without the refresh cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(refreshResponse.status).toBe(401)
    expect(await refreshResponse.json()).toEqual({
      message: '刷新令牌无效',
    })
  })

  it('logs out successfully without a refresh cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const response = await app.request('/api/auth/logout', {
      method: 'POST',
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('set-cookie')).toContain('refresh_token=')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('logs out by revoking refresh tokens and clearing the cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const logoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${registered.refreshToken}`,
      },
    })

    expect(logoutResponse.status).toBe(204)
    expect(logoutResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(logoutResponse.headers.get('set-cookie')).toContain('Max-Age=0')

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${registered.refreshToken}`,
      },
    })

    expect(refreshResponse.status).toBe(401)

    const secondLogoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${registered.refreshToken}`,
      },
    })

    expect(secondLogoutResponse.status).toBe(204)
  })

  it('ignores logout body tokens and uses the refresh cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const logoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: '',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: `refresh_token=${registered.refreshToken}`,
      },
    })

    expect(logoutResponse.status).toBe(204)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${registered.refreshToken}`,
      },
    })

    expect(refreshResponse.status).toBe(401)
  })

  it('clears the refresh cookie when logout cannot revoke the refresh session', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const tokenPair = await createTokenPair(
        '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        readAuthConfig(),
      )
      const app = createTestApp({
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => {
                throw new Error('revoke failed')
              },
            }),
          }),
        }),
      } as never)

      const response = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${tokenPair.refreshToken}`,
        },
      })

      expect(response.status).toBe(500)
      expect(response.headers.get('set-cookie')).toContain('refresh_token=')
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('returns the current user for a valid access token', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const response = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
      },
    })
    const body = (await response.json()) as {
      user: {
        id: string
        username: string
        nickname: string
        email: string | null
        phone: string | null
        status: number
        departments: { id: string; name: string; code: string }[]
        roles: { id: string; name: string; code: string }[]
        createdAt: string
        updatedAt: string
      }
      accessCodes: string[]
      menus: unknown[]
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      user: {
        id: registered.body.user.id,
        username: 'ada',
        nickname: 'Ada Lovelace',
        departments: [],
        roles: [],
      },
    })
    expect(body).toMatchObject({
      accessCodes: [],
      menus: [],
    })
  })

  it('returns department summaries from login me and refresh for associated users', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)
    const departmentId = randomUUID()
    const now = new Date()

    await database.insert(departments).values({
      id: departmentId,
      name: 'Engineering',
      code: 'engineering',
      createdAt: now,
      updatedAt: now,
    })
    await database.insert(userDepartments).values({
      userId: registered.body.user.id,
      departmentId,
      createdAt: now,
    })

    const loggedIn = await login(app)

    expect(loggedIn.response.status).toBe(200)
    expect((loggedIn.body as AuthTokenResponse).accessCodes).toEqual([])
    expect((loggedIn.body as AuthTokenResponse).menus).toEqual([])
    expect(loggedIn.body).toMatchObject({
      user: {
        id: registered.body.user.id,
        departments: [
          {
            id: departmentId,
            name: 'Engineering',
            code: 'engineering',
          },
        ],
        roles: [],
      },
    })

    const meResponse = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
      },
    })
    const meBody = await meResponse.json()

    expect(meResponse.status).toBe(200)
    expect(meBody).toMatchObject({
      user: {
        id: registered.body.user.id,
        departments: [
          {
            id: departmentId,
            name: 'Engineering',
            code: 'engineering',
          },
        ],
        roles: [],
      },
      accessCodes: [],
      menus: [],
    })

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${registered.refreshToken}`,
      },
    })
    const refreshBody = (await refreshResponse.json()) as AuthTokenResponse

    expect(refreshResponse.status).toBe(200)
    expect(refreshBody).toMatchObject({
      user: {
        id: registered.body.user.id,
        departments: [
          {
            id: departmentId,
            name: 'Engineering',
            code: 'engineering',
          },
        ],
        roles: [],
      },
    })
    expect(refreshBody.accessCodes).toEqual([])
    expect(refreshBody.menus).toEqual([])
  })

  it('rejects bearer authorization headers with extra fields for current user', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const response = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken} extra`,
      },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: '未授权',
    })
  })

  it('rejects missing, refresh, and disabled-user tokens for current user', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const missingResponse = await app.request('/api/auth/me')
    expect(missingResponse.status).toBe(401)
    expect(await missingResponse.json()).toEqual({
      message: '未授权',
    })

    const refreshTokenResponse = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.refreshToken}`,
      },
    })
    expect(refreshTokenResponse.status).toBe(401)

    await database
      .update(users)
      .set({
        status: USER_STATUS_DISABLED,
      })
      .where(eq(users.id, registered.body.user.id))

    const disabledResponse = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
      },
    })

    expect(disabledResponse.status).toBe(401)
    expect(await disabledResponse.json()).toEqual({
      message: '未授权',
    })
  })

  it('marks expired access tokens as refreshable for current user requests', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)
    const expiredAccessToken = await sign(
      {
        sub: registered.body.user.id,
        type: 'access',
        iat: 1,
        exp: 2,
      },
      readAuthConfig().accessSecret,
      'HS256',
    )

    const response = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${expiredAccessToken}`,
      },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get(AUTH_ACTION_HEADER)).toBe(AUTH_ACTION_REFRESH)
    expect(await response.json()).toEqual({
      message: '未授权',
    })
  })
})
