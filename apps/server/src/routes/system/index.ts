import { Hono } from 'hono'
import { systemUserRoutes } from './users'

export const systemRoutes = new Hono().route('/users', systemUserRoutes)
