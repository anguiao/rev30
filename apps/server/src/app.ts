import { Hono } from 'hono'
import type { Db } from './db'
import { createAuthMiddleware } from './middleware/auth'
import { createRequestLogger } from './middleware/logger'
import { createAttachmentRoutes } from './modules/attachments/routes'
import { createAuthRoutes } from './modules/auth/routes'
import { createContentRoutes } from './modules/content/routes'
import { healthRoutes } from './modules/health/routes'
import { iconRoutes } from './modules/icons/routes'
import { createIconSearchRoutes } from './modules/icons/search/routes'
import { createSystemRoutes } from './modules/system/routes'

export function createApiRoutes(database: Db) {
  const authMiddleware = createAuthMiddleware(database)

  return new Hono()
    .route('/', healthRoutes)
    .route('/auth', createAuthRoutes(database, authMiddleware))
    .route('/icons/search', createIconSearchRoutes(authMiddleware))
    .route('/icons', iconRoutes)
    .route('/attachments', createAttachmentRoutes(database, authMiddleware))
    .route('/system', createSystemRoutes(database, authMiddleware))
    .route('/content', createContentRoutes(database, authMiddleware))
}

export function createApp(database: Db) {
  return new Hono().use('*', createRequestLogger()).route('/api', createApiRoutes(database))
}

export type AppType = ReturnType<typeof createApiRoutes>
