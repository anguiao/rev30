import { iconSearchQuerySchema } from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { Db } from '../../../db'
import type { AuthEnv } from '../../../middleware/auth'
import { createIconSearchService } from './service'
import {
  IconSearchPreparingError,
  IconSearchUnavailableError,
  InvalidIconCursorError,
} from '../errors'

const iconSearchQueryValidator = zValidator('query', iconSearchQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})

function iconSearchErrorResponse(error: unknown, c: Context) {
  if (error instanceof InvalidIconCursorError) {
    return c.json({ code: error.code, message: error.message }, 400)
  }

  if (error instanceof IconSearchPreparingError || error instanceof IconSearchUnavailableError) {
    return c.json({ code: error.code, message: error.message }, 503)
  }

  throw error
}

export function createIconSearchRoutes(database: Db, authMiddleware: MiddlewareHandler<AuthEnv>) {
  const service = createIconSearchService(database)

  return new Hono()
    .onError((error, c) => iconSearchErrorResponse(error, c))
    .use('*', authMiddleware)
    .get('/', iconSearchQueryValidator, async (c) => {
      const query = c.req.valid('query')
      const result = await service.searchIcons(query)

      return c.json(result)
    })
}
