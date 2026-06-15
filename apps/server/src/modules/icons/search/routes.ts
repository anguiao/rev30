import { iconSearchQuerySchema } from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type MiddlewareHandler } from 'hono'
import type { Db } from '../../../db'
import type { AuthEnv } from '../../../middleware/auth'
import { createIconSearchService } from './service'

const iconSearchQueryValidator = zValidator('query', iconSearchQuerySchema, (result, c) => {
  if (!result.success) {
    return c.text('404', 404)
  }
})

export function createIconSearchRoutes(database: Db, authMiddleware: MiddlewareHandler<AuthEnv>) {
  const service = createIconSearchService(database)

  return new Hono().use('*', authMiddleware).get('/', iconSearchQueryValidator, async (c) => {
    const query = c.req.valid('query')
    const result = await service.searchIcons(query)

    return c.json(result)
  })
}
