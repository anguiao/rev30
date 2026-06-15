import { Hono, type MiddlewareHandler } from 'hono'
import type { Db } from '../../../db'
import type { AuthEnv } from '../../../middleware/auth'
import { builtinIconSetRoutes } from './builtin/routes'
import { createCustomIconSetRoutes } from './custom/routes'

export function createIconSetRoutes(database: Db, authMiddleware: MiddlewareHandler<AuthEnv>) {
  return new Hono<AuthEnv>()
    .use('*', authMiddleware)
    .route('/builtin', builtinIconSetRoutes)
    .route('/custom', createCustomIconSetRoutes(database))
}
