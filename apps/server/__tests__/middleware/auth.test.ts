import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { User } from '@rev30/shared'
import { createTestDb } from '../helpers/db'
import { createAuthMiddleware } from '../../src/middleware/auth'
import { createAuthRoutes } from '../../src/modules/auth/routes'

type AuthVariables = {
  currentUser: User
}

async function register(app: Hono) {
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

  return (await response.json()) as { accessToken: string; user: User }
}

describe('auth middleware', () => {
  it('exposes the authenticated user to downstream handlers', async () => {
    const database = await createTestDb()
    const authApp = new Hono().route('/api/auth', createAuthRoutes(database))
    const registered = await register(authApp)
    expect(registered.user.departments).toEqual([])
    expect(registered.user.roles).toEqual([])
    const app = new Hono<{ Variables: AuthVariables }>()
      .use('/me', createAuthMiddleware(database))
      .get('/me', (c) => c.json(c.get('currentUser')))

    const response = await app.request('/me', {
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(registered.user)
  })
})
