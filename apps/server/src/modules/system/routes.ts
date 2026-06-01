import { Hono, type MiddlewareHandler } from 'hono'
import type { Db } from '../../db'
import type { AuthEnv } from '../../middleware/auth'
import { createConfigRoutes } from './configs/routes'
import { createDictionaryRoutes } from './dictionaries/routes'
import { createDepartmentRoutes } from './departments/routes'
import { createRoleRoutes } from './roles/routes'
import { createResourceRoutes } from './resources/routes'
import { createUserRoutes } from './users/routes'

export function createSystemRoutes(database: Db, authMiddleware: MiddlewareHandler<AuthEnv>) {
  return new Hono<AuthEnv>()
    .use('*', authMiddleware)
    .route('/configs', createConfigRoutes(database))
    .route('/dictionaries', createDictionaryRoutes(database))
    .route('/departments', createDepartmentRoutes(database))
    .route('/roles', createRoleRoutes(database))
    .route('/resources', createResourceRoutes(database))
    .route('/users', createUserRoutes(database))
}
