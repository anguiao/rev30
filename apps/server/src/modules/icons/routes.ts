import { iconDataParamSchema, iconDataQuerySchema } from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getIconSubset } from './service'

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

export const iconRoutes = new Hono()
  .use('*', (c, next) => {
    c.header('cross-origin-resource-policy', 'cross-origin')
    c.header('cache-control', 'public, max-age=604800, min-refresh=604800, immutable')

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
    const subset = await getIconSubset(prefix, icons)

    if (!subset) {
      return c.text('404', 404)
    }

    c.header('content-type', 'application/json; charset=utf-8')

    return c.body(JSON.stringify(subset, null, pretty ? 4 : undefined), 200)
  })
