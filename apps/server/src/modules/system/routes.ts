import { Hono } from 'hono'
import type { Db } from '../../db'
import { createConfigRoutes } from './configs/routes'
import { createDictionaryRoutes } from './dictionaries/routes'
import { createDepartmentRoutes } from './departments/routes'
import { createRoleRoutes } from './roles/routes'
import { createResourceRoutes } from './resources/routes'
import { createUserRoutes } from './users/routes'

export function createSystemRoutes(database: Db) {
  return new Hono()
    .route('/configs', createConfigRoutes(database))
    .route('/dictionaries', createDictionaryRoutes(database))
    .route('/departments', createDepartmentRoutes(database))
    .route('/roles', createRoleRoutes(database))
    .route('/resources', createResourceRoutes(database))
    .route('/users', createUserRoutes(database))
}
