import { randomUUID } from 'node:crypto'
import { assert, describe, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type AuthTokenResponse,
  type AuthSessionResponse,
  type AuthLoginInput,
  type AuthLoginResponse,
  type ErrorResponse,
  type User,
} from '@rev30/contracts'
import {
  attachments,
  authPasswordCredentials,
  authSessions,
  authLoginAttemptBuckets,
  opsLoginLogs,
  systemDepartments,
  systemConfigOverrides,
  systemRoles,
  systemUserDepartments,
  systemUserRoles,
  systemUsers,
} from '../../../src/db/schema'
import { dbTest, type TestDatabase } from '../../fixtures/database'
import {
  createSystemResourceFixture as createResource,
  createSystemUserFixture,
} from '../../helpers/system'
import type { RequestContextEnv } from '../../../src/middleware/request-context'
import { createLogger } from '../../../src/runtime/logger'
import { createAuthMiddleware } from '../../../src/middleware/auth'
import { hashPassword, verifyPassword } from '../../../src/modules/auth/password'
import { createAuthRoutes } from '../../../src/modules/auth/routes'
import { createAuthRepository } from '../../../src/modules/auth/repository'
import { readAuthConfig } from '../../../src/modules/auth/config'
import { verifyAccessToken, verifyRefreshToken } from '../../../src/modules/auth/tokens'
import { verifyAttachmentAccessToken } from '../../../src/modules/attachments/access-token'

type AuthLoginResult = AuthLoginResponse | ErrorResponse

type TestTransaction = Parameters<Parameters<TestDatabase['transaction']>[0]>[0]
type FixturePassword = 'old-password' | 'secret-password'
type AccountInput = {
  username?: string
  password?: FixturePassword
  nickname?: string
  email?: string | null
  phone?: string | null
  status?: number
}

const now = new Date('2026-05-06T00:00:00.000Z')
const fixturePasswordHashPromises: Record<FixturePassword, Promise<string>> = {
  'old-password': hashPassword('old-password'),
  'secret-password': hashPassword('secret-password'),
}

function createTestApp(database: TestDatabase) {
  return new Hono<RequestContextEnv>()
    .use('*', async (c, next) => {
      c.set('requestContext', {
        requestId: randomUUID(),
        clientIp: '192.0.2.1',
        clientIpSource: 'socket',
        userAgent: 'integration-test',
        logger: createLogger({ level: 'silent' }),
      })
      await next()
    })
    .route('/api/auth', createAuthRoutes(database, createAuthMiddleware(database)))
}

function getRefreshTokenCookie(response: Response) {
  return response.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1]
}

function getAttachmentAccessTokenCookie(response: Response) {
  return response.headers.get('set-cookie')?.match(/attachment_token=([^;]+)/)?.[1]
}

function requireRefreshToken(token: string | undefined) {
  if (!token) {
    throw new Error('Expected refresh token cookie')
  }

  return token
}

function requireAttachmentAccessToken(token: string | undefined) {
  if (!token) {
    throw new Error('Expected attachment access token cookie')
  }

  return token
}

async function createPasswordAccount(database: TestDatabase, input: AccountInput = {}) {
  const password = input.password ?? 'secret-password'
  const user = await createSystemUserFixture(database, {
    username: input.username ?? 'ada',
    nickname: input.nickname ?? 'Ada Lovelace',
    email: input.email ?? null,
    phone: input.phone ?? null,
    status: input.status ?? USER_STATUS_ENABLED,
    createdAt: now,
    updatedAt: now,
  })

  await database.insert(authPasswordCredentials).values({
    userId: user.id,
    passwordHash: await fixturePasswordHashPromises[password],
  })

  return user
}

async function createLoggedInAccount(
  app: ReturnType<typeof createTestApp>,
  database: TestDatabase,
  input: AccountInput = {},
) {
  const user = await createPasswordAccount(database, input)
  const session = await login(app, {
    username: user.username,
    password: input.password ?? 'secret-password',
  })

  expect(session.response.status).toBe(200)
  assert('accessToken' in session.body, 'Expected a successful login response')

  return {
    ...session,
    body: session.body,
    refreshToken: requireRefreshToken(session.refreshToken),
    user,
  }
}

async function login(app: ReturnType<typeof createTestApp>, body: Partial<AuthLoginInput> = {}) {
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
    body: (await response.json()) as AuthLoginResult,
    refreshToken: getRefreshTokenCookie(response),
    response,
  }
}

function createTestAppWithRefreshRevokeFailure(database: TestDatabase) {
  return createTestApp(
    new Proxy(database, {
      get(target, property, receiver) {
        if (property === 'transaction') {
          return async (callback: (tx: TestTransaction) => Promise<unknown>) =>
            target.transaction(async (tx) =>
              callback(
                new Proxy(tx, {
                  get(txTarget, txProperty, txReceiver) {
                    if (txProperty === 'update') {
                      return (table: unknown) => {
                        if (table === authSessions) {
                          return {
                            set() {
                              return {
                                where: () => ({
                                  returning: async () => {
                                    throw new Error('revoke failed')
                                  },
                                }),
                              }
                            },
                          }
                        }

                        return txTarget.update(table as never)
                      }
                    }

                    const value = Reflect.get(txTarget, txProperty, txReceiver)

                    return typeof value === 'function' ? value.bind(txTarget) : value
                  },
                }) as TestTransaction,
              ),
            )
        }

        const value = Reflect.get(target, property, receiver)

        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as TestDatabase,
  )
}

describe('auth routes', () => {
  dbTest('logs in with username and password', async ({ db: database }) => {
    const app = createTestApp(database)

    await createPasswordAccount(database)
    const { body: responseBody, response } = await login(app)
    const body = responseBody as AuthLoginResponse

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('refresh_token=')
    expect(response.headers.get('set-cookie')).toContain('attachment_token=')
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      mustChangePassword: false,
      user: {
        username: 'ada',
        departments: [],
        roles: [],
      },
    })
    expect(body.accessCodes).toEqual([])
    expect(body.menus).toEqual([])
    expect(body).not.toHaveProperty('refreshToken')
    expect(body).not.toHaveProperty('attachmentAccessToken')
    expect(body).not.toHaveProperty('sessionId')
    const refreshToken = requireRefreshToken(getRefreshTokenCookie(response))
    const attachmentToken = response.headers
      .get('set-cookie')
      ?.match(/attachment_token=([^;]+)/)?.[1]
    const config = readAuthConfig()
    const [access, refresh, attachment] = await Promise.all([
      verifyAccessToken(body.accessToken, config),
      verifyRefreshToken(refreshToken, config),
      verifyAttachmentAccessToken(requireAttachmentAccessToken(attachmentToken), config),
    ])
    const refreshPayload = await verify(refreshToken, config.refreshSecret, 'HS256')
    const [storedSession] = await database
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, refresh.sessionId))
    expect(access.sessionId).toBe(refresh.sessionId)
    expect(attachment.sessionId).toBe(refresh.sessionId)
    expect(storedSession?.expiresAt.getTime()).toBe(Number(refreshPayload.exp) * 1000)
    await expect(database.select().from(opsLoginLogs)).resolves.toMatchObject([
      { result: 'success', failureReason: null, sessionId: refresh.sessionId },
    ])
  })

  dbTest('creates independent stable sessions for separate logins', async ({ db }) => {
    const app = createTestApp(db)
    const registered = await createLoggedInAccount(app, db, {
      username: 'two-login-user',
    })
    const second = await login(app, { username: 'two-login-user' })
    const config = readAuthConfig()
    const [firstToken, secondToken] = await Promise.all([
      verifyRefreshToken(requireRefreshToken(registered.refreshToken), config),
      verifyRefreshToken(requireRefreshToken(second.refreshToken), config),
    ])

    expect(firstToken.sessionId).not.toBe(secondToken.sessionId)
    await expect(
      db.select().from(authSessions).where(eq(authSessions.userId, registered.user.id)),
    ).resolves.toHaveLength(2)
  })

  dbTest(
    'returns a uniform credentials error for wrong passwords and disabled users',
    async ({ db: database }) => {
      const app = createTestApp(database)

      const account = await createPasswordAccount(database)
      const wrongPassword = await login(app, {
        password: 'wrong-password',
      })

      expect(wrongPassword.response.status).toBe(401)
      expect(wrongPassword.body).toEqual({
        message: '用户名或密码错误',
      })

      await database
        .update(systemUsers)
        .set({
          status: USER_STATUS_DISABLED,
        })
        .where(eq(systemUsers.id, account.id))

      const disabled = await login(app)

      expect(disabled.response.status).toBe(401)
      expect(disabled.body).toEqual({
        message: '用户名或密码错误',
      })
      await expect(database.select().from(opsLoginLogs)).resolves.toMatchObject([
        { userId: account.id, result: 'failure', failureReason: 'invalid_credentials' },
        { userId: account.id, result: 'failure', failureReason: 'account_disabled' },
      ])
    },
  )

  dbTest(
    'locks a username after repeated login failures and clears failures after success',
    async ({ db: database }) => {
      const app = createTestApp(database)

      await createPasswordAccount(database, {
        username: 'rate-limit-user',
        password: 'secret-password',
      })

      for (let index = 0; index < 5; index += 1) {
        const failed = await login(app, {
          username: 'rate-limit-user',
          password: 'wrong-password',
        })

        expect(failed.response.status).toBe(401)
        expect(failed.body).toEqual({ message: '用户名或密码错误' })
      }

      const locked = await login(app, {
        username: 'rate-limit-user',
        password: 'secret-password',
      })

      expect(locked.response.status).toBe(429)
      expect(locked.body).toEqual({ message: '登录失败次数过多，请稍后再试' })
      expect(locked.response.headers.get('set-cookie')).toBeNull()
      const [rateLimitedLog] = await database
        .select()
        .from(opsLoginLogs)
        .where(eq(opsLoginLogs.failureReason, 'rate_limited'))
      expect(rateLimitedLog).toMatchObject({ userId: null, username: 'rate-limit-user' })

      await createPasswordAccount(database, {
        username: 'clear-bucket-login-user',
        password: 'secret-password',
      })

      const clearBucketFailed = await login(app, {
        username: 'clear-bucket-login-user',
        password: 'wrong-password',
      })

      expect(clearBucketFailed.response.status).toBe(401)
      expect(clearBucketFailed.body).toEqual({ message: '用户名或密码错误' })

      const failedBuckets = await database
        .select()
        .from(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, 'clear-bucket-login-user'))

      expect(failedBuckets).toHaveLength(1)

      const clearBucketSuccess = await login(app, {
        username: 'clear-bucket-login-user',
        password: 'secret-password',
      })

      expect(clearBucketSuccess.response.status).toBe(200)
      expect(clearBucketSuccess.response.headers.get('set-cookie')).toContain('refresh_token=')

      const clearedBuckets = await database
        .select()
        .from(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, 'clear-bucket-login-user'))

      expect(clearedBuckets).toHaveLength(0)

      const unaffectedUser = await createPasswordAccount(database, {
        username: 'unaffected-login-user',
        password: 'secret-password',
      })
      const unaffected = await login(app, {
        username: unaffectedUser.username,
        password: 'secret-password',
      })

      expect(unaffected.response.status).toBe(200)

      await database
        .delete(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, 'rate-limit-user'))

      const recovered = await login(app, {
        username: 'rate-limit-user',
        password: 'secret-password',
      })

      expect(recovered.response.status).toBe(200)
      expect(recovered.response.headers.get('set-cookie')).toContain('refresh_token=')

      const remainingBuckets = await database
        .select()
        .from(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, 'rate-limit-user'))

      expect(remainingBuckets).toHaveLength(0)
    },
  )

  dbTest(
    'uses system config overrides for login failure limits without recreating routes',
    async ({ db: database }) => {
      const app = createTestApp(database)

      await createPasswordAccount(database, {
        username: 'dynamic-rate-limit-user',
        password: 'secret-password',
      })

      await database.insert(systemConfigOverrides).values({
        key: 'auth.loginFailureMaxAttempts',
        value: '2',
      })

      for (let index = 0; index < 2; index += 1) {
        const failed = await login(app, {
          username: 'dynamic-rate-limit-user',
          password: 'wrong-password',
        })

        expect(failed.response.status).toBe(401)
        expect(failed.body).toEqual({ message: '用户名或密码错误' })
      }

      const locked = await login(app, {
        username: 'dynamic-rate-limit-user',
        password: 'secret-password',
      })

      expect(locked.response.status).toBe(429)
      expect(locked.body).toEqual({ message: '登录失败次数过多，请稍后再试' })
    },
  )

  dbTest('returns role summaries on login', async ({ db: database }) => {
    const app = createTestApp(database)
    const account = await createPasswordAccount(database, {
      username: 'role-login-user',
      nickname: 'Role Login User',
      password: 'secret-password',
    })
    const now = new Date()

    const [role] = await database
      .insert(systemRoles)
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

    await database.insert(systemUserRoles).values({
      userId: account.id,
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

  dbTest('returns admin access codes and menus on login', async ({ db: database }) => {
    const app = createTestApp(database)
    const account = await createPasswordAccount(database, {
      username: 'admin-login',
      nickname: 'Admin Login',
      password: 'secret-password',
    })
    const [adminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.code, 'admin'))

    assert(adminRole, 'Expected seeded admin role')

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

    await database.insert(systemUserRoles).values({
      userId: account.id,
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

  dbTest(
    'rotates refresh tokens and rejects reuse of the old refresh token',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database)
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
      expect(refreshResponse.headers.get('set-cookie')).toContain('attachment_token=')
      expect(refreshBody).not.toHaveProperty('refreshToken')
      expect(refreshBody).not.toHaveProperty('attachmentAccessToken')
      expect(refreshBody.user.id).toBe(registered.body.user.id)
      expect(refreshBody.user.departments).toEqual([])
      expect(refreshBody.user.roles).toEqual([])
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

      const secondRefreshResponse = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: { cookie: `refresh_token=${requireRefreshToken(newRefreshToken)}` },
      })
      const latestRefreshToken = requireRefreshToken(getRefreshTokenCookie(secondRefreshResponse))
      const [first, latest] = await Promise.all([
        verifyRefreshToken(requireRefreshToken(oldRefreshToken), readAuthConfig()),
        verifyRefreshToken(latestRefreshToken, readAuthConfig()),
      ])
      expect(secondRefreshResponse.status).toBe(200)
      expect(latest.sessionId).toBe(first.sessionId)
      await expect(
        database.select().from(authSessions).where(eq(authSessions.userId, registered.user.id)),
      ).resolves.toMatchObject([
        { id: first.sessionId, refreshTokenHash: latest.refreshTokenHash, revokedAt: null },
      ])
    },
  )

  dbTest(
    'consumes a refresh token once for competing requests on the PGlite connection',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database)
      const oldRefreshToken = requireRefreshToken(registered.refreshToken)
      const refresh = () =>
        app.request('/api/auth/refresh', {
          method: 'POST',
          headers: {
            cookie: `refresh_token=${oldRefreshToken}`,
          },
        })

      // PGlite serializes one connection; this checks one-time consumption, not cross-connection isolation.
      const responses = await Promise.all([refresh(), refresh()])

      expect(
        responses.map((response) => response.status).sort((left, right) => left - right),
      ).toEqual([200, 401])

      const successResponse = responses.find((response) => response.status === 200)
      const unauthorizedResponse = responses.find((response) => response.status === 401)

      if (!successResponse || !unauthorizedResponse) {
        throw new Error('Expected one successful and one unauthorized refresh response')
      }

      const newRefreshToken = requireRefreshToken(getRefreshTokenCookie(successResponse))
      const config = readAuthConfig()
      const [oldToken, newToken] = await Promise.all([
        verifyRefreshToken(oldRefreshToken, config),
        verifyRefreshToken(newRefreshToken, config),
      ])
      const sessions = await database
        .select()
        .from(authSessions)
        .where(eq(authSessions.userId, registered.user.id))
      const activeSessions = sessions.filter(
        (session) => session.revokedAt === null && session.expiresAt > new Date(),
      )

      expect(await unauthorizedResponse.json()).toEqual({ message: '刷新令牌无效' })
      expect(newRefreshToken).not.toBe(oldRefreshToken)
      expect(sessions).toHaveLength(1)
      expect(newToken.sessionId).toBe(oldToken.sessionId)
      expect(activeSessions).toMatchObject([
        {
          refreshTokenHash: newToken.refreshTokenHash,
          revokedAt: null,
        },
      ])
    },
  )

  dbTest(
    'logs out by revoking the stable session for all three tokens and clearing cookies',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database)
      const attachmentAccess = await verifyAttachmentAccessToken(
        requireAttachmentAccessToken(getAttachmentAccessTokenCookie(registered.response)),
        readAuthConfig(),
      )

      const logoutResponse = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${registered.refreshToken}`,
        },
      })

      expect(logoutResponse.status).toBe(204)
      expect(logoutResponse.headers.get('set-cookie')).toContain('refresh_token=')
      expect(logoutResponse.headers.get('set-cookie')).toContain('attachment_token=')
      expect(logoutResponse.headers.get('set-cookie')).toContain('Max-Age=0')
      expect(logoutResponse.headers.get('set-cookie')).toContain('Path=/api/attachments')

      const refreshResponse = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${registered.refreshToken}`,
        },
      })

      expect(refreshResponse.status).toBe(401)

      const accessResponse = await app.request('/api/auth/me', {
        headers: {
          authorization: `Bearer ${registered.body.accessToken}`,
        },
      })
      expect(accessResponse.status).toBe(401)
      expect(accessResponse.headers.get(AUTH_ACTION_HEADER)).toBeNull()

      await expect(
        createAuthRepository(database).findValidSessionUser(
          attachmentAccess.sessionId,
          attachmentAccess.userId,
          new Date(),
        ),
      ).resolves.toBeUndefined()

      const secondLogoutResponse = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${registered.refreshToken}`,
        },
      })

      expect(secondLogoutResponse.status).toBe(204)
    },
  )

  dbTest('returns the current user for a valid access token', async ({ db: database }) => {
    const app = createTestApp(database)
    const registered = await createLoggedInAccount(app, database)

    const response = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
      },
    })
    const body = (await response.json()) as AuthSessionResponse

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

  dbTest('updates current user profile', async ({ db: database }) => {
    const app = createTestApp(database)
    const registered = await createLoggedInAccount(app, database)

    const validResponse = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Updated Nickname',
        avatarId: null,
        email: 'updated@example.com',
        phone: '',
      }),
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
        'content-type': 'application/json',
      },
    })
    const validBody = await validResponse.json()

    expect(validResponse.status).toBe(200)
    expect(validBody).toMatchObject({
      username: registered.body.user.username,
      nickname: 'Updated Nickname',
      email: 'updated@example.com',
      phone: null,
    })
  })

  dbTest('updates current user avatar ids through profile updates', async ({ db: database }) => {
    const app = createTestApp(database)
    const registered = await createLoggedInAccount(app, database)
    const avatarId = randomUUID()
    const now = new Date('2026-05-30T00:00:00.000Z')

    await database.insert(attachments).values({
      id: avatarId,
      storageProvider: 'local',
      storageKey: `2026/05/30/${avatarId}.png`,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: 'avatar',
      createdBy: registered.user.id,
      createdAt: now,
    })

    const response = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Avatar Profile',
        avatarId,
        email: null,
        phone: null,
      }),
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
        'content-type': 'application/json',
      },
    })
    const body = (await response.json()) as User

    expect(response.status).toBe(200)
    expect(body.avatarId).toBe(avatarId)
  })

  dbTest(
    'returns bad request when current user avatar ids do not exist',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database)

      const response = await app.request('/api/auth/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          nickname: 'Invalid Avatar',
          avatarId: '11111111-1111-4111-8111-111111111111',
          email: null,
          phone: null,
        }),
        headers: {
          authorization: `Bearer ${registered.body.accessToken}`,
          'content-type': 'application/json',
        },
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        message: '请求体无效',
      })
    },
  )

  dbTest(
    'changes current user password and clears must-change-password state',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database, {
        password: 'old-password',
      })
      await database
        .update(authPasswordCredentials)
        .set({ mustChangePassword: true })
        .where(eq(authPasswordCredentials.userId, registered.body.user.id))

      const temporaryLogin = await login(app, { password: 'old-password' })
      expect(temporaryLogin.response.status).toBe(200)
      expect(temporaryLogin.body).toMatchObject({ mustChangePassword: true })

      const wrongResponse = await app.request('/api/auth/me/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'wrong-password',
          newPassword: 'new-password',
        }),
        headers: {
          authorization: `Bearer ${registered.body.accessToken}`,
          'content-type': 'application/json',
        },
      })
      expect(wrongResponse.status).toBe(400)
      expect(await wrongResponse.json()).toEqual({
        field: 'currentPassword',
        message: '当前密码错误',
      })

      const response = await app.request('/api/auth/me/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'old-password',
          newPassword: 'new-password',
        }),
        headers: {
          authorization: `Bearer ${registered.body.accessToken}`,
          cookie: `refresh_token=${registered.refreshToken}`,
          'content-type': 'application/json',
        },
      })
      expect(response.status).toBe(200)

      const credential = await database.query.authPasswordCredentials.findFirst({
        where: { userId: registered.body.user.id },
      })
      expect(credential?.mustChangePassword).toBe(false)
      expect(await verifyPassword('new-password', credential!.passwordHash)).toBe(true)

      const updatedLogin = await login(app, { password: 'new-password' })
      expect(updatedLogin.response.status).toBe(200)
      expect(updatedLogin.body).toMatchObject({ mustChangePassword: false })
    },
  )

  dbTest(
    'replaces the current session and revokes every old session after a password change',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database, {
        password: 'old-password',
        username: 'password-keep-current',
        nickname: 'Password Keep Current',
      })
      const currentSession = await login(app, {
        username: 'password-keep-current',
        password: 'old-password',
      })
      const currentRefreshToken = requireRefreshToken(currentSession.refreshToken)
      const currentAuth = currentSession.body as AuthTokenResponse
      const config = readAuthConfig()
      const [registeredAttachment, currentAttachment] = await Promise.all([
        verifyAttachmentAccessToken(
          requireAttachmentAccessToken(getAttachmentAccessTokenCookie(registered.response)),
          config,
        ),
        verifyAttachmentAccessToken(
          requireAttachmentAccessToken(getAttachmentAccessTokenCookie(currentSession.response)),
          config,
        ),
      ])

      const response = await app.request('/api/auth/me/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'old-password',
          newPassword: 'new-password',
        }),
        headers: {
          authorization: `Bearer ${currentAuth.accessToken}`,
          cookie: `refresh_token=${currentRefreshToken}`,
          'content-type': 'application/json',
        },
      })

      expect(response.status).toBe(200)

      const passwordSession = (await response.json()) as AuthTokenResponse
      const newRefreshToken = requireRefreshToken(getRefreshTokenCookie(response))
      const [verifiedNewAccess, verifiedNewToken, verifiedNewAttachment] = await Promise.all([
        verifyAccessToken(passwordSession.accessToken, config),
        verifyRefreshToken(newRefreshToken, config),
        verifyAttachmentAccessToken(
          requireAttachmentAccessToken(getAttachmentAccessTokenCookie(response)),
          config,
        ),
      ])
      expect(verifiedNewAccess.sessionId).toBe(verifiedNewToken.sessionId)
      expect(verifiedNewAttachment.sessionId).toBe(verifiedNewToken.sessionId)
      const sessions = await database.query.authSessions.findMany({
        where: { userId: registered.body.user.id },
      })

      expect(sessions.filter((session) => session.revokedAt === null)).toMatchObject([
        { id: verifiedNewToken.sessionId, refreshTokenHash: verifiedNewToken.refreshTokenHash },
      ])
      expect(
        sessions
          .filter((session) => session.id !== verifiedNewToken.sessionId)
          .every((session) => session.revocationReason === 'password_changed'),
      ).toBe(true)

      const oldRefreshResponse = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${requireRefreshToken(registered.refreshToken)}`,
        },
      })
      expect(oldRefreshResponse.status).toBe(401)

      const oldCurrentRefreshResponse = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${currentRefreshToken}`,
        },
      })
      expect(oldCurrentRefreshResponse.status).toBe(401)

      for (const accessToken of [registered.body.accessToken, currentAuth.accessToken]) {
        const oldAccessResponse = await app.request('/api/auth/me', {
          headers: { authorization: `Bearer ${accessToken}` },
        })
        expect(oldAccessResponse.status).toBe(401)
        expect(oldAccessResponse.headers.get(AUTH_ACTION_HEADER)).toBeNull()
      }

      const authRepository = createAuthRepository(database)
      for (const attachmentAccess of [registeredAttachment, currentAttachment]) {
        await expect(
          authRepository.findValidSessionUser(
            attachmentAccess.sessionId,
            attachmentAccess.userId,
            new Date(),
          ),
        ).resolves.toBeUndefined()
      }
      await expect(
        authRepository.findValidSessionUser(
          verifiedNewAttachment.sessionId,
          verifiedNewAttachment.userId,
          new Date(),
        ),
      ).resolves.toBeDefined()

      const newAccessResponse = await app.request('/api/auth/me', {
        headers: { authorization: `Bearer ${passwordSession.accessToken}` },
      })
      expect(newAccessResponse.status).toBe(200)

      const newRefreshResponse = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${newRefreshToken}`,
        },
      })
      expect(newRefreshResponse.status).toBe(200)
    },
  )

  dbTest.for([
    { name: 'missing', headers: {} },
    { name: 'invalid', headers: { cookie: 'refresh_token=invalid-refresh-token' } },
  ])(
    'revokes old sessions after a password change with a $name refresh cookie',
    async ({ name, headers }, { db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database, {
        password: 'old-password',
        username: `password-revoke-${name}-cookie`,
        nickname: `Password Revoke ${name} Cookie`,
      })
      const secondSession = await login(app, {
        username: `password-revoke-${name}-cookie`,
        password: 'old-password',
      })

      const response = await app.request('/api/auth/me/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'old-password',
          newPassword: 'new-password',
        }),
        headers: {
          ...headers,
          authorization: `Bearer ${registered.body.accessToken}`,
          'content-type': 'application/json',
        },
      })

      expect(response.status).toBe(200)

      const sessions = await database.query.authSessions.findMany({
        where: { userId: registered.body.user.id },
      })
      expect(sessions.filter((session) => session.revokedAt === null)).toHaveLength(1)
      expect(
        sessions
          .filter((session) => session.revokedAt !== null)
          .every((session) => session.revocationReason === 'password_changed'),
      ).toBe(true)

      const firstRefreshResponse = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${requireRefreshToken(registered.refreshToken)}`,
        },
      })
      expect(firstRefreshResponse.status).toBe(401)

      const secondRefreshResponse = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `refresh_token=${requireRefreshToken(secondSession.refreshToken)}`,
        },
      })
      expect(secondRefreshResponse.status).toBe(401)
    },
  )

  dbTest(
    'rolls back password changes when refresh session revocation fails',
    async ({ db: database }) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      try {
        const setupApp = createTestApp(database)
        const registered = await createLoggedInAccount(setupApp, database, {
          password: 'old-password',
          username: 'password-rollback-on-revoke-failure',
          nickname: 'Password Rollback On Revoke Failure',
        })
        const currentSession = await login(setupApp, {
          username: 'password-rollback-on-revoke-failure',
          password: 'old-password',
        })
        await database
          .update(authPasswordCredentials)
          .set({ mustChangePassword: true })
          .where(eq(authPasswordCredentials.userId, registered.body.user.id))

        const app = createTestAppWithRefreshRevokeFailure(database)
        const response = await app.request('/api/auth/me/password', {
          method: 'PATCH',
          body: JSON.stringify({
            currentPassword: 'old-password',
            newPassword: 'new-password',
          }),
          headers: {
            authorization: `Bearer ${(currentSession.body as AuthTokenResponse).accessToken}`,
            cookie: `refresh_token=${requireRefreshToken(currentSession.refreshToken)}`,
            'content-type': 'application/json',
          },
        })

        expect(response.status).toBe(500)

        const credential = await database.query.authPasswordCredentials.findFirst({
          where: { userId: registered.body.user.id },
        })
        const sessions = await database.query.authSessions.findMany({
          where: { userId: registered.body.user.id },
        })

        expect(credential?.mustChangePassword).toBe(true)
        expect(await verifyPassword('old-password', credential!.passwordHash)).toBe(true)
        expect(await verifyPassword('new-password', credential!.passwordHash)).toBe(false)
        expect(sessions.every((session) => session.revokedAt === null)).toBe(true)
      } finally {
        consoleError.mockRestore()
      }
    },
  )

  dbTest(
    'returns updated department summaries from login and existing-session me and refresh',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const existingSession = await createLoggedInAccount(app, database)
      const departmentId = randomUUID()
      const now = new Date()

      await database.insert(systemDepartments).values({
        id: departmentId,
        name: 'Engineering',
        code: 'engineering',
        createdAt: now,
        updatedAt: now,
      })
      await database.insert(systemUserDepartments).values({
        userId: existingSession.user.id,
        departmentId,
        createdAt: now,
      })

      const loggedIn = await login(app)
      const loggedInBody = loggedIn.body as AuthTokenResponse

      expect(loggedIn.response.status).toBe(200)
      expect(loggedInBody.accessCodes).toEqual([])
      expect(loggedInBody.menus).toEqual([])
      expect(loggedInBody).toMatchObject({
        user: {
          id: existingSession.user.id,
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
          authorization: `Bearer ${existingSession.body.accessToken}`,
        },
      })
      const meBody = await meResponse.json()

      expect(meResponse.status).toBe(200)
      expect(meBody).toMatchObject({
        user: {
          id: existingSession.user.id,
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
          cookie: `refresh_token=${existingSession.refreshToken}`,
        },
      })
      const refreshBody = (await refreshResponse.json()) as AuthTokenResponse

      expect(refreshResponse.status).toBe(200)
      expect(refreshBody).toMatchObject({
        user: {
          id: existingSession.user.id,
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
    },
  )

  dbTest(
    'rejects bearer authorization headers with extra fields for current user',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database)

      const response = await app.request('/api/auth/me', {
        headers: {
          authorization: `Bearer ${registered.body.accessToken} extra`,
        },
      })

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: '未授权',
      })
    },
  )

  dbTest(
    'rejects missing, refresh, and disabled-user tokens for current user',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const registered = await createLoggedInAccount(app, database)

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
        .update(systemUsers)
        .set({
          status: USER_STATUS_DISABLED,
        })
        .where(eq(systemUsers.id, registered.body.user.id))

      const disabledResponse = await app.request('/api/auth/me', {
        headers: {
          authorization: `Bearer ${registered.body.accessToken}`,
        },
      })

      expect(disabledResponse.status).toBe(401)
      expect(await disabledResponse.json()).toEqual({
        message: '未授权',
      })
    },
  )

  dbTest(
    'marks expired access tokens as refreshable for current user requests',
    async ({ db: database }) => {
      const app = createTestApp(database)
      const expiredAccessToken = await sign(
        {
          sub: '11111111-1111-4111-8111-111111111111',
          sid: '22222222-2222-4222-8222-222222222222',
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
    },
  )
})
