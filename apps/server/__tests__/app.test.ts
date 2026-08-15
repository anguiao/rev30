import { describe, expect } from 'vitest'
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
import { dbTest } from './fixtures/database'
import { systemRoles } from '../src/db/schema'
import { createAuthMiddleware, type AuthVariables } from '../src/middleware/auth'
import { readAuthConfig } from '../src/modules/auth/config'

const attachmentId = '11111111-1111-4111-8111-111111111111'
const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
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

function expectRequestId(response: Response) {
  const requestId = response.headers.get('x-request-id')

  expect(requestId).toMatch(requestIdPattern)

  return requestId
}

describe('app auth boundaries', () => {
  dbTest(
    'returns a unique server request ID on standard application response boundaries',
    async ({ db }) => {
      const app = createApp(db)
      const noAccess = await createSystemAccessFixture(db, {
        usernamePrefix: 'app-request-id',
      })
      const responses = [
        await app.request('/api/health'),
        await app.request('/api/system/users'),
        await app.request('/api/system/users', {
          headers: noAccess.authHeaders,
        }),
        await app.request('/api/not-found'),
        await app.request('/api/attachments/uploads', {
          method: 'POST',
          body: '{}',
          headers: {
            'content-length': String(5 * 1024 * 1024 + 1),
            'content-type': 'application/json',
          },
        }),
      ]

      expect(responses.map((response) => response.status)).toEqual([200, 401, 403, 404, 413])

      const requestIds = responses.map(expectRequestId)

      expect(new Set(requestIds).size).toBe(responses.length)
    },
  )

  dbTest('rejects oversized JSON bodies before route parsing', async ({ db }) => {
    const app = createApp(db)

    const response = await app.request('/api/attachments/uploads', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-length': String(5 * 1024 * 1024 + 1),
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ message: '请求体过大' })
  })

  dbTest.for(protectedAppRoutes)('requires authentication for $name', async ({ path }, { db }) => {
    const app = createApp(db)

    const response = await app.request(path)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
    expect(response.headers.has(AUTH_ACTION_HEADER)).toBe(false)
  })

  dbTest(
    'keeps icon data and attachment content outside authentication middleware',
    async ({ db: database }) => {
      const app = createApp(database)

      const iconDataResponse = await app.request('/api/icons/lucide.json?icons=sun')
      const attachmentContentResponse = await app.request(
        `/api/attachments/${attachmentId}/content`,
      )

      expect(iconDataResponse.status).toBe(200)
      expect(attachmentContentResponse.status).toBe(404)
      expect(await attachmentContentResponse.json()).toEqual({ message: '附件不存在' })
    },
  )

  dbTest.for(protectedAttachmentRoutes)(
    'requires authentication for attachment $name',
    async ({ path, init }, { db }) => {
      const app = createApp(db)

      const response = await app.request(path, init)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ message: '未授权' })
    },
  )

  dbTest('returns 403 for logged-in users without route access', async ({ db: database }) => {
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

  dbTest('marks expired access tokens as refreshable on system routes', async ({ db }) => {
    const app = createApp(db)
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

  dbTest('does not mark invalid access tokens as refreshable on system routes', async ({ db }) => {
    const app = createApp(db)
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
  dbTest(
    'exposes the authenticated user and admin access context to downstream handlers',
    async ({ db: database }) => {
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
    },
  )

  dbTest('does not treat disabled admin roles as admin access', async ({ db: database }) => {
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
