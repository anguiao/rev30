import { Hono } from 'hono'
import type { Db } from '../../db'
import { createDepartmentRoutes } from './departments/routes'
import { createUserRoutes } from './users/routes'

export function createSystemRoutes(database: Db) {
  return new Hono()
    .route('/departments', createDepartmentRoutes(database))
    .route('/users', createUserRoutes(database))
}
