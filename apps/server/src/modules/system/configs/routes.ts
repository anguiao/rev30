import {
  configKeySchema,
  configListResponseSchema,
  configSchema,
  configUpdateSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import { ConfigInvalidValueError, ConfigNotFoundError } from './errors'
import { createConfigService } from './service'

const configKeyParamSchema = z.object({
  key: configKeySchema,
})

const configKeyValidator = zValidator('param', configKeyParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '配置键无效' }, 400)
  }
})

const configUpdateBodyValidator = zValidator('json', configUpdateSchema, (result, c) => {
  if (!result.success) {
    const { fieldErrors } = z.flattenError(result.error)
    const customValueError = fieldErrors.customValue?.[0]

    if (customValueError) {
      return c.json({ field: 'customValue', message: customValueError }, 400)
    }

    return c.json({ message: '请求体无效' }, 400)
  }
})

function configErrorResponse(error: unknown, c: Context) {
  if (error instanceof ConfigInvalidValueError) {
    return c.json({ field: error.field, message: error.message }, 400)
  }

  if (error instanceof ConfigNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createConfigRoutes(database: Db) {
  const service = createConfigService(database)
  const app = new Hono()

  app.onError((error, c) => configErrorResponse(error, c))

  return app
    .get('/', requireAccess('system:config:list'), async (c) => {
      return c.json(configListResponseSchema.parse(await service.list()))
    })
    .get('/:key', requireAccess('system:config:list'), configKeyValidator, async (c) => {
      const { key } = c.req.valid('param')

      return c.json(configSchema.parse(await service.get(key)))
    })
    .put(
      '/:key',
      requireAccess('system:config:update'),
      configKeyValidator,
      configUpdateBodyValidator,
      async (c) => {
        const { key } = c.req.valid('param')
        const body = c.req.valid('json')

        return c.json(configSchema.parse(await service.update(key, body)))
      },
    )
}
