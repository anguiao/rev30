import { iconSearchQuerySchema } from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { Db } from '../../../db'
import { createAuthMiddleware } from '../../../middleware/auth'
import { searchIcons } from './service'

const iconSearchQueryValidator = zValidator('query', iconSearchQuerySchema, (result, c) => {
  if (!result.success) {
    return c.text('404', 404)
  }
})

export function createIconSearchRoutes(database: Db) {
  return new Hono()
    .use('*', createAuthMiddleware(database))
    .get('/', iconSearchQueryValidator, async (c) => {
      const query = c.req.valid('query')
      const result = await searchIcons(query)

      return c.json(result)
    })
}
