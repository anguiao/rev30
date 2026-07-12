import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  type ResourceTreeNode,
  type User,
} from '@rev30/contracts'
import { createApp } from '../src/app'
import { createSystemAccessFixture } from './helpers/auth'
import { createTestDb } from './helpers/db'
import { systemRoles } from '../src/db/schema'
import { createAuthMiddleware, type AuthVariables } from '../src/middleware/auth'
import { readAuthConfig } from '../src/modules/auth/config'

function createUnusedDatabase() {
  return {} as Awaited<ReturnType<typeof createTestDb>>
}

const attachmentId = '11111111-1111-4111-8111-111111111111'
const protectedAppRoutes = [
  {
    name: 'icon search',
    path: '/api/icons/search?keyword=user',
  },
  {
    name: 'system routes',
    path: '/api/system/users',
  },
  {
    name: 'current-user content routes',
    path: '/api/content/announcements/my',
  },
] as const
const protectedAttachmentRoutes: Array<{
  init?: RequestInit
  name: string
  path: string
}> = [
  {
    name: 'metadata',
    path: `/api/attachments/${attachmentId}`,
  },
  {
    name: 'upload session creation',
    path: '/api/attachments/uploads',
    init: {
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
    },
  },
  {
    name: 'content URL creation',
    path: `/api/attachments/${attachmentId}/content-url`,
    init: {
      method: 'POST',
      body: JSON.stringify({
        disposition: 'inline',
      }),
      headers: {
        'content-type': 'application/json',
      },
    },
  },
]

describe('app auth boundaries', () => {
  it.each(protectedAppRoutes)('requires authentication for $name', async ({ path }) => {
    const app = createApp(createUnusedDatabase())

    const response = await app.request(path)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
    expect(response.headers.has(AUTH_ACTION_HEADER)).toBe(false)
  })

  it('keeps icon data and attachment content outside authentication middleware', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const iconDataResponse = await app.request('/api/icons/lucide.json?icons=sun')
    const attachmentContentResponse = await app.request(`/api/attachments/${attachmentId}/content`)

    expect(iconDataResponse.status).toBe(200)
    expect(attachmentContentResponse.status).toBe(404)
    expect(await attachmentContentResponse.json()).toEqual({ message: '附件不存在' })
  })

  it.each(protectedAttachmentRoutes)(
    'requires authentication for attachment $name',
    async ({ path, init }) => {
      const app = createApp(createUnusedDatabase())

      const response = await app.request(path, init)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ message: '未授权' })
    },
  )

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

describe('auth middleware', () => {
  it('exposes the authenticated user and admin access context to downstream handlers', async () => {
    const database = await createTestDb()
    const adminSession = await createSystemAccessFixture(database, {
      admin: true,
      usernamePrefix: 'auth-middleware-admin',
    })
    const app = new Hono<{ Variables: AuthVariables }>()
      .use('/me', createAuthMiddleware(database))
      .get('/me', (c) =>
        c.json({
          user: c.get('currentUser'),
          accessCodes: c.get('accessCodes'),
          menus: c.get('menus'),
          isAdmin: c.get('isAdmin'),
        }),
      )

    const response = await app.request('/me', {
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    })
    const body = (await response.json()) as {
      user: User
      accessCodes: string[]
      menus: ResourceTreeNode[]
      isAdmin: boolean
    }

    expect(response.status).toBe(200)
    expect(body.user.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'admin' })]),
    )
    expect(body.accessCodes).toEqual(
      expect.arrayContaining(['system', 'system:user', 'system:user:list']),
    )
    expect(body.menus).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'system' })]),
    )
    expect(body.isAdmin).toBe(true)
  })

  it('does not treat disabled admin roles as admin access', async () => {
    const database = await createTestDb()
    const adminSession = await createSystemAccessFixture(database, {
      admin: true,
      usernamePrefix: 'auth-middleware-disabled-admin',
    })
    const app = new Hono<{ Variables: AuthVariables }>()
      .use('/me', createAuthMiddleware(database))
      .get('/me', (c) =>
        c.json({
          user: c.get('currentUser'),
          accessCodes: c.get('accessCodes'),
          menus: c.get('menus'),
          isAdmin: c.get('isAdmin'),
        }),
      )

    await database.update(systemRoles).set({ status: 0 }).where(eq(systemRoles.code, 'admin'))

    const response = await app.request('/me', {
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: expect.objectContaining({
        roles: expect.arrayContaining([expect.objectContaining({ code: 'admin' })]),
      }),
      accessCodes: [],
      menus: [],
      isAdmin: false,
    })
  })
})
