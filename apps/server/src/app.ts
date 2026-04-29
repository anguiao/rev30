import { Hono } from 'hono'
import { healthRoutes } from './routes/health'

export const apiRoutes = new Hono().route('/', healthRoutes)

export const app = new Hono().route('/api', apiRoutes)

export type AppType = typeof apiRoutes
