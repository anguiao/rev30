import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { USER_STATUS_DISABLED, type AuthTokenResponse } from '@rev30/shared'
import { authPasswordCredentials, users } from '../../db/schema'
import { createTestDb } from '../../test/db'
import { verifyPassword } from './password'
import { createAuthRoutes } from './routes'

type ErrorResponse = {
  message: string
  field?: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/auth', createAuthRoutes(database))
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
    body:
      response.status === 200
        ? ((await response.json()) as AuthTokenResponse)
        : ((await response.json()) as ErrorResponse),
    response,
  }
}

describe('auth routes', () => {
  it('registers users with a password credential, token response, and refresh cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body, response } = await register(app, {
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
      },
    })
    expect(body.accessToken).toEqual(expect.any(String))
    expect(body.refreshToken).toEqual(expect.any(String))

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
      message: 'username already exists',
    })
  })

  it('logs in with username and password', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    await register(app)
    const { body, response } = await login(app)

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('refresh_token=')
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        username: 'ada',
      },
    })
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
      message: 'Invalid username or password',
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
      message: 'Invalid username or password',
    })
  })

  it('rotates refresh tokens and rejects reuse of the old refresh token', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const refreshBody = (await refreshResponse.json()) as AuthTokenResponse

    expect(refreshResponse.status).toBe(200)
    expect(refreshResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(refreshBody.refreshToken).not.toBe(registered.body.refreshToken)

    const reuseResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const reuseBody = (await reuseResponse.json()) as ErrorResponse

    expect(reuseResponse.status).toBe(401)
    expect(reuseBody).toEqual({
      message: 'Invalid refresh token',
    })
  })

  it('refreshes from the refresh cookie when no body token is provided', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${registered.body.refreshToken}`,
      },
    })
    const refreshBody = (await refreshResponse.json()) as AuthTokenResponse

    expect(refreshResponse.status).toBe(200)
    expect(refreshBody.user.id).toBe(registered.body.user.id)
    expect(refreshBody.refreshToken).not.toBe(registered.body.refreshToken)
  })

  it('rejects invalid token request bodies before using the refresh cookie', async () => {
    for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
      for (const body of ['{', JSON.stringify({ refreshToken: 123 })]) {
        const database = await createTestDb()
        const app = createTestApp(database)
        const registered = await register(app)

        const response = await app.request(path, {
          method: 'POST',
          body,
          headers: {
            'content-type': 'application/json',
            cookie: `refresh_token=${registered.body.refreshToken}`,
          },
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
          message: 'Invalid body',
        })
      }
    }
  })

  it('does not fall back to the refresh cookie when the body provides an empty refresh token', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: '',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: `refresh_token=${registered.body.refreshToken}`,
      },
    })

    expect(refreshResponse.status).toBe(401)
    expect(await refreshResponse.json()).toEqual({
      message: 'Invalid refresh token',
    })
  })

  it('logs out by revoking refresh tokens and clearing the cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const logoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(logoutResponse.status).toBe(204)
    expect(logoutResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(logoutResponse.headers.get('set-cookie')).toContain('Max-Age=0')

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(refreshResponse.status).toBe(401)

    const secondLogoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(secondLogoutResponse.status).toBe(204)
  })

  it('uses the logout body refresh token before the refresh cookie', async () => {
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
        cookie: `refresh_token=${registered.body.refreshToken}`,
      },
    })

    expect(logoutResponse.status).toBe(204)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(refreshResponse.status).toBe(200)
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
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      id: registered.body.user.id,
      username: 'ada',
      nickname: 'Ada Lovelace',
    })
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
      message: 'Unauthorized',
    })
  })

  it('rejects missing, refresh, and disabled-user tokens for current user', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const missingResponse = await app.request('/api/auth/me')
    expect(missingResponse.status).toBe(401)
    expect(await missingResponse.json()).toEqual({
      message: 'Unauthorized',
    })

    const refreshTokenResponse = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.refreshToken}`,
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
      message: 'Unauthorized',
    })
  })
})
