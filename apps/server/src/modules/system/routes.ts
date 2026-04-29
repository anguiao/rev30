import { Hono } from 'hono'
import { systemUserRoutes } from './users/routes'

export const systemRoutes = new Hono().route('/users', systemUserRoutes)
