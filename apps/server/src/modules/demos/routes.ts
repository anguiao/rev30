import { Hono, type MiddlewareHandler } from 'hono'
import type { AuthEnv } from '../../middleware/auth'
import { richTextDemoRoutes } from './rich-text/routes'

export function createDemoRoutes(authMiddleware: MiddlewareHandler<AuthEnv>) {
  return new Hono<AuthEnv>().use('*', authMiddleware).route('/rich-text', richTextDemoRoutes)
}
