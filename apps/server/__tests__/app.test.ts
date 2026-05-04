import { describe, expect, it } from 'vitest'
import { sign } from 'hono/jwt'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  type AuthTokenResponse,
  type ResourceListResponse,
  type UserListResponse,
} from '@rev30/shared'
import { createApp } from '../src/app'
import { createTestDb } from './helpers/db'
import { readAuthConfig } from '../src/modules/auth/config'

async function register(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'ada',
      password: 'secret-password',
      nickname: 'Ada Lovelace',
    }),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body: (await response.json()) as AuthTokenResponse,
    refreshToken: response.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1],
  }
}

describe('app auth boundaries', () => {
  it('logs requests through the injected app logger', async () => {
    const database = await createTestDb()
    const logs: Array<{
      level: string
      payload: Record<string, unknown>
      message: string
    }> = []
    const app = createApp(database, {
      logger: {
        info: (payload, message) => logs.push({ level: 'info', payload, message }),
        error: (payload, message) => logs.push({ level: 'error', payload, message }),
      },
      now: () => 100,
    })

    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(logs).toEqual([
      {
        level: 'info',
        payload: {
          method: 'GET',
          path: '/api/health',
        },
        message: 'request started',
      },
      {
        level: 'info',
        payload: {
          durationMs: 0,
          method: 'GET',
          path: '/api/health',
          status: 200,
        },
        message: 'request completed',
      },
    ])
  })

  it('rejects system routes without an access token', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const response = await app.request('/api/system/users')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: '未授权',
    })
    expect(response.headers.has(AUTH_ACTION_HEADER)).toBe(false)
  })

  it('allows system routes with an access token', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const registered = await register(app)
    expect(registered.body.user.departments).toEqual([])

    const response = await app.request('/api/system/users', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
      },
    })
    const body = (await response.json()) as UserListResponse

    expect(response.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.list[0]?.id).toBe(registered.body.user.id)
  })

  it('allows resources route with a system access token', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const registered = await register(app)

    const response = await app.request('/api/system/resources', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
      },
    })
    const body = (await response.json()) as ResourceListResponse

    expect(response.status).toBe(200)
    expect(body).toEqual({
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
  })

  it('rejects system routes with a refresh token', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const registered = await register(app)

    const response = await app.request('/api/system/users', {
      headers: {
        authorization: `Bearer ${registered.refreshToken}`,
      },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: '未授权',
    })
    expect(response.headers.has(AUTH_ACTION_HEADER)).toBe(false)
  })

  it('marks expired access tokens as refreshable on system routes', async () => {
    const database = await createTestDb()
    const app = createApp(database)
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

    const response = await app.request('/api/system/users', {
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

  it('does not mark invalid access tokens as refreshable on system routes', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const registered = await register(app)
    const invalidExpiredAccessToken = await sign(
      {
        sub: registered.body.user.id,
        type: 'access',
        iat: 1,
        exp: 2,
      },
      'wrong-access-secret',
      'HS256',
    )

    const response = await app.request('/api/system/users', {
      headers: {
        authorization: `Bearer ${invalidExpiredAccessToken}`,
      },
    })

    expect(response.status).toBe(401)
    expect(response.headers.has(AUTH_ACTION_HEADER)).toBe(false)
  })
})
