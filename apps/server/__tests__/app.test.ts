import { describe, expect, it } from 'vitest'
import { sign } from 'hono/jwt'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  type RoleListResponse,
  type ResourceListResponse,
  type UserListResponse,
} from '@rev30/contracts'
import { createApp } from '../src/app'
import { createSystemAccessFixture } from './helpers/auth'
import { createTestDb } from './helpers/db'
import { readAuthConfig } from '../src/modules/auth/config'

function createUnusedDatabase() {
  return {} as Awaited<ReturnType<typeof createTestDb>>
}

describe('app auth boundaries', () => {
  it('rejects system routes without an access token', async () => {
    const app = createApp(createUnusedDatabase())

    const response = await app.request('/api/system/users')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: '未授权',
    })
    expect(response.headers.has(AUTH_ACTION_HEADER)).toBe(false)
  })

  it('requires authentication for icon search while keeping icon data public', async () => {
    const app = createApp(createUnusedDatabase())

    const searchResponse = await app.request('/api/icons/search?keyword=user')
    const iconDataResponse = await app.request('/api/icons/lucide.json?icons=sun')

    expect(searchResponse.status).toBe(401)
    expect(await searchResponse.json()).toEqual({ message: '未授权' })
    expect(iconDataResponse.status).toBe(200)
    expect(iconDataResponse.headers.get('cache-control')).toBe(
      'public, max-age=604800, min-refresh=604800, immutable',
    )
  })

  it('requires authentication for attachment metadata routes', async () => {
    const app = createApp(createUnusedDatabase())

    const response = await app.request('/api/attachments/11111111-1111-4111-8111-111111111111')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  it('requires authentication for attachment upload route', async () => {
    const app = createApp(createUnusedDatabase())

    const response = await app.request('/api/attachments/uploads', {
      method: 'POST',
      body: JSON.stringify({
        originalName: 'avatar.png',
        usage: 'avatar',
        size: 4,
        contentType: 'image/png',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  it('requires authentication for attachment content-url route', async () => {
    const app = createApp(createUnusedDatabase())

    const response = await app.request(
      '/api/attachments/11111111-1111-4111-8111-111111111111/content-url',
      {
        method: 'POST',
        body: JSON.stringify({
          disposition: 'inline',
        }),
        headers: {
          'content-type': 'application/json',
        },
      },
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  it('requires authentication for attachment delete route', async () => {
    const app = createApp(createUnusedDatabase())

    const response = await app.request('/api/attachments/11111111-1111-4111-8111-111111111111', {
      method: 'DELETE',
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  it('allows icon search for logged-in users without resource access', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'app-icon-search-user',
    })

    const response = await app.request('/api/icons/search?keyword=lucide:users&limit=1', {
      headers: authenticated.authHeaders,
    })

    expect(response.status).toBe(200)
  })

  it('returns 403 for logged-in users without route access', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'app-no-access',
    })

    const response = await app.request('/api/system/users', {
      headers: authenticated.authHeaders,
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: '无权访问' })
  })

  it('allows system routes with a matching resource access token', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const authorized = await createSystemAccessFixture(database, {
      accessCodes: ['system:user:list'],
      usernamePrefix: 'app-users-reader',
    })

    const response = await app.request('/api/system/users', {
      headers: authorized.authHeaders,
    })
    const body = (await response.json()) as UserListResponse

    expect(response.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.list[0]?.id).toBe(authorized.userId)
  })

  it('allows resources route with a system access token', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const authorized = await createSystemAccessFixture(database, {
      accessCodes: ['system:resource:list'],
      usernamePrefix: 'app-resources-reader',
    })

    const response = await app.request('/api/system/resources', {
      headers: authorized.authHeaders,
    })
    const body = (await response.json()) as ResourceListResponse

    expect(response.status).toBe(200)
    expect(body.total).toBeGreaterThanOrEqual(1)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(20)
    expect(body.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'system',
          name: '系统管理',
        }),
      ]),
    )
  })

  it('allows roles route with a system access token', async () => {
    const database = await createTestDb()
    const app = createApp(database)
    const authorized = await createSystemAccessFixture(database, {
      accessCodes: ['system:role:list'],
      usernamePrefix: 'app-roles-reader',
    })

    const response = await app.request('/api/system/roles', {
      headers: authorized.authHeaders,
    })
    const body = (await response.json()) as RoleListResponse

    expect(response.status).toBe(200)
    expect(body.total).toBeGreaterThanOrEqual(1)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(20)
    expect(body.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'admin',
          name: 'Administrator',
        }),
      ]),
    )
  })

  it('rejects system routes with a refresh token', async () => {
    const app = createApp(createUnusedDatabase())
    const config = readAuthConfig()
    const refreshToken = await sign(
      {
        sub: 'unused-user-id',
        type: 'refresh',
        jti: 'unused-refresh-token-id',
        iat: 1,
        exp: 9999999999,
      },
      config.refreshSecret,
      'HS256',
    )

    const response = await app.request('/api/system/users', {
      headers: {
        authorization: `Bearer ${refreshToken}`,
      },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: '未授权',
    })
    expect(response.headers.has(AUTH_ACTION_HEADER)).toBe(false)
  })

  it('marks expired access tokens as refreshable on system routes', async () => {
    const app = createApp(createUnusedDatabase())
    const expiredAccessToken = await sign(
      {
        sub: 'unused-user-id',
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
    const app = createApp(createUnusedDatabase())
    const invalidExpiredAccessToken = await sign(
      {
        sub: 'unused-user-id',
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
