import { Hono } from 'hono'
import type { Db } from './db'
import type { RequestLogger } from './logger'
import { createAuthMiddleware } from './middleware/auth'
import { createRequestLogger } from './middleware/logger'
import { createAuthRoutes } from './modules/auth/routes'
import { createContentRoutes } from './modules/content/routes'
import { healthRoutes } from './modules/health/routes'
import { iconRoutes } from './modules/icons/routes'
import { createSystemRoutes } from './modules/system/routes'

export type CreateAppOptions = {
  logger?: RequestLogger
  now?: () => number
}

export function createApiRoutes(database: Db) {
  return new Hono()
    .route('/', healthRoutes)
    .route('/auth', createAuthRoutes(database))
    .route('/icons', iconRoutes)
    .use('/system/*', createAuthMiddleware(database))
    .route('/system', createSystemRoutes(database))
    .use('/content/*', createAuthMiddleware(database))
    .route('/content', createContentRoutes(database))
}

export function createApp(database: Db, options: CreateAppOptions = {}) {
  return new Hono().use('*', createRequestLogger(options)).route('/api', createApiRoutes(database))
}

export type AppType = ReturnType<typeof createApiRoutes>
