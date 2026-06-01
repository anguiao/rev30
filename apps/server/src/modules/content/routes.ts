import { Hono, type MiddlewareHandler } from 'hono'
import type { Db } from '../../db'
import type { AuthEnv } from '../../middleware/auth'
import { createAnnouncementRoutes } from './announcements/routes'

export function createContentRoutes(database: Db, authMiddleware: MiddlewareHandler<AuthEnv>) {
  return new Hono<AuthEnv>()
    .use('*', authMiddleware)
    .route('/announcements', createAnnouncementRoutes(database))
}
