import { Hono } from 'hono'
import type { Db } from '../../db'
import { createUserRoutes } from './users/routes'

export function createSystemRoutes(database: Db) {
  return new Hono().route('/users', createUserRoutes(database))
}
