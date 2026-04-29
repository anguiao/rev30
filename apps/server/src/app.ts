import { Hono } from 'hono'
import { healthRoutes } from './routes/health'
import { systemRoutes } from './routes/system'

export const apiRoutes = new Hono().route('/', healthRoutes).route('/system', systemRoutes)

export const app = new Hono().route('/api', apiRoutes)

export type AppType = typeof apiRoutes
