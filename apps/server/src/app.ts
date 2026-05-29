import { Hono } from 'hono'
import type { Db } from './db'
import { createAuthMiddleware } from './middleware/auth'
import { createRequestLogger } from './middleware/logger'
import { createAttachmentContentRoutes, createAttachmentRoutes } from './modules/attachments/routes'
import { createAuthRoutes } from './modules/auth/routes'
import { createContentRoutes } from './modules/content/routes'
import { healthRoutes } from './modules/health/routes'
import { iconRoutes } from './modules/icons/routes'
import { createIconSearchRoutes } from './modules/icons/search/routes'
import { createSystemRoutes } from './modules/system/routes'

export function createApiRoutes(database: Db) {
  return new Hono()
    .route('/', healthRoutes)
    .route('/auth', createAuthRoutes(database))
    .route('/attachments', createAttachmentContentRoutes(database))
    .use('/attachments/*', createAuthMiddleware(database))
    .route('/attachments', createAttachmentRoutes(database))
    .route('/icons/search', createIconSearchRoutes(database))
    .route('/icons', iconRoutes)
    .use('/system/*', createAuthMiddleware(database))
    .route('/system', createSystemRoutes(database))
    .use('/content/*', createAuthMiddleware(database))
    .route('/content', createContentRoutes(database))
}

export function createApp(database: Db) {
  return new Hono().use('*', createRequestLogger()).route('/api', createApiRoutes(database))
}

export type AppType = ReturnType<typeof createApiRoutes>
