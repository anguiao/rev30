import { Hono } from 'hono'
import { healthRoutes } from './modules/health/routes'
import { systemRoutes } from './modules/system/routes'

export const apiRoutes = new Hono().route('/', healthRoutes).route('/system', systemRoutes)

export const app = new Hono().route('/api', apiRoutes)

export type AppType = typeof apiRoutes
