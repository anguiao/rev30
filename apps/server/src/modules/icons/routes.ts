import { iconDataParamSchema, iconDataQuerySchema } from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Db } from '../../db'
import { createIconDataService } from './service'

const iconDataCacheControl = 'public, max-age=604800, min-refresh=604800, immutable'
const customIconDataCacheControl = 'no-cache'

const iconParamValidator = zValidator('param', iconDataParamSchema, (result, c) => {
  if (!result.success) {
    return c.text('404', 404)
  }
})

const iconQueryValidator = zValidator('query', iconDataQuerySchema, (result, c) => {
  if (!result.success) {
    return c.text('404', 404)
  }
})

export function createIconRoutes(database: Db) {
  const service = createIconDataService(database)

  return new Hono()
    .use('*', (c, next) => {
      c.header('cross-origin-resource-policy', 'cross-origin')
      c.header('cache-control', iconDataCacheControl)

      return next()
    })
    .use(
      '*',
      cors({
        origin: '*',
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Accept-Encoding'],
        maxAge: 86400,
      }),
    )
    .get('/:filename', iconParamValidator, iconQueryValidator, async (c) => {
      const { prefix } = c.req.valid('param')
      const { icons, pretty } = c.req.valid('query')
      const result = await service.getIconSubset(prefix, icons)

      if (!result) {
        return c.text('404', 404)
      }

      if (result.source === 'custom') {
        c.header('cache-control', customIconDataCacheControl)
      }

      c.header('content-type', 'application/json; charset=utf-8')

      return c.body(JSON.stringify(result.subset, null, pretty ? 4 : undefined), 200)
    })
}
