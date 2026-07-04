import { Hono } from 'hono'
import type { Db } from '../../../db'
import type { AuthEnv } from '../../../middleware/auth'
import { builtinIconSetRoutes } from './builtin/routes'
import { createCustomIconSetRoutes } from './custom/routes'

export function createIconSetRoutes(database: Db) {
  return new Hono<AuthEnv>()
    .route('/builtin', builtinIconSetRoutes)
    .route('/custom', createCustomIconSetRoutes(database))
}
