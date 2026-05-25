import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { type ResourceTreeNode, type User } from '@rev30/contracts'
import { createTestDb } from '../helpers/db'
import { createSystemAccessFixture } from '../helpers/auth'
import { createAuthMiddleware, type AuthVariables } from '../../src/middleware/auth'
import { systemRoles } from '../../src/db/schema'

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
