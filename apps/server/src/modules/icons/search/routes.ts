import { iconSearchQuerySchema } from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type MiddlewareHandler } from 'hono'
import type { AuthEnv } from '../../../middleware/auth'
import { searchIcons } from './service'

const iconSearchQueryValidator = zValidator('query', iconSearchQuerySchema, (result, c) => {
  if (!result.success) {
    return c.text('404', 404)
  }
})

export function createIconSearchRoutes(authMiddleware: MiddlewareHandler<AuthEnv>) {
  return new Hono().use('*', authMiddleware).get('/', iconSearchQueryValidator, async (c) => {
    const query = c.req.valid('query')
    const result = await searchIcons(query)

    return c.json(result)
  })
}
