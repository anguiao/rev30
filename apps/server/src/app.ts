import { Hono } from 'hono'
import type { Db } from './db'
import { createAuthMiddleware } from './middleware/auth'
import { healthRoutes } from './modules/health/routes'
import { createAuthRoutes } from './modules/auth/routes'
import { createSystemRoutes } from './modules/system/routes'

export function createApiRoutes(database: Db) {
  return new Hono()
    .route('/', healthRoutes)
    .route('/auth', createAuthRoutes(database))
    .use('/system/*', createAuthMiddleware(database))
    .route('/system', createSystemRoutes(database))
}

export function createApp(database: Db) {
  return new Hono().route('/api', createApiRoutes(database))
}

export type AppType = ReturnType<typeof createApiRoutes>
