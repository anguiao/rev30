import { Hono } from 'hono'
import type { Db } from '../../db'
import { createSystemUserRoutes } from './users/routes'

export function createSystemRoutes(database: Db) {
  return new Hono().route('/users', createSystemUserRoutes(database))
}
