import { describe, expect, it } from 'vitest'
import { sign } from 'hono/jwt'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  type AuthTokenResponse,
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
