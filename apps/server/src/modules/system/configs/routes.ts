import {
  type ConfigCreateInput,
  type ConfigListQuery,
  type ConfigUpdateInput,
  configCreateSchema,
  configListQuerySchema,
  configSchema,
  configUpdateSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import { ConfigConflictError, ConfigInvalidValueError, ConfigNotFoundError } from './errors'
import { createConfigService } from './service'

const configIdParamSchema = configSchema.pick({ id: true })
const configListRequestQuerySchema = configListQuerySchema
  .optional()
  .transform((query) => query ?? configListQuerySchema.parse({}))

const configIdValidator = zValidator('param', configIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '配置 ID 无效' }, 400)
  }
})

const configListQueryValidator = zValidator('query', configListRequestQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})

const configCreateBodyValidator = zValidator('json', configCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const configUpdateBodyValidator = zValidator('json', configUpdateSchema, (result, c) => {
  if (!result.success) {
    const valueError = z.flattenError(result.error).fieldErrors.value?.[0]

    if (valueError) {
      return c.json({ field: 'value', message: valueError }, 400)
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

  if (error instanceof ConfigConflictError) {
    return c.json({ field: error.field, message: error.message }, 409)
  }

  throw error
}

export function createConfigRoutes(database: Db) {
  const service = createConfigService(database)
  const app = new Hono()

  app.onError((error, c) => configErrorResponse(error, c))

  return app
    .get('/', requireAccess('system:config:list'), configListQueryValidator, async (c) => {
      const query: ConfigListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/:id', requireAccess('system:config:list'), configIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post('/', requireAccess('system:config:create'), configCreateBodyValidator, async (c) => {
      const body: ConfigCreateInput = c.req.valid('json')

      return c.json(await service.create(body), 201)
    })
    .patch(
      '/:id',
      requireAccess('system:config:update'),
      configIdValidator,
      configUpdateBodyValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        const body: ConfigUpdateInput = c.req.valid('json')

        return c.json(await service.update(id, body))
      },
    )
    .delete('/:id', requireAccess('system:config:delete'), configIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return c.body(null, 204)
    })
}
