import {
  type DictionaryCreateInput,
  type DictionaryListQuery,
  type DictionaryOptionsQuery,
  type DictionaryUpdateInput,
  dictionaryCreateSchema,
  dictionaryListQuerySchema,
  dictionaryOptionsQuerySchema,
  dictionaryTypeSchema,
  dictionaryUpdateSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import {
  DictionaryCodeConflictError,
  DictionaryInvalidItemError,
  DictionaryItemValueConflictError,
  DictionaryNotFoundError,
} from './errors'
import { createDictionaryService } from './service'

const dictionaryIdParamSchema = dictionaryTypeSchema.pick({ id: true })
const dictionaryListRequestQuerySchema = dictionaryListQuerySchema
  .optional()
  .transform((query) => query ?? dictionaryListQuerySchema.parse({}))

const dictionaryIdValidator = zValidator('param', dictionaryIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '数据字典 ID 无效' }, 400)
  }
})

const dictionaryListQueryValidator = zValidator(
  'query',
  dictionaryListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

const dictionaryOptionsQueryValidator = zValidator(
  'query',
  dictionaryOptionsQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

const dictionaryCreateBodyValidator = zValidator('json', dictionaryCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const dictionaryUpdateBodyValidator = zValidator('json', dictionaryUpdateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function dictionaryErrorResponse(error: unknown, c: Context) {
  if (error instanceof DictionaryNotFoundError || error instanceof DictionaryInvalidItemError) {
    return c.json({ message: error.message }, error instanceof DictionaryNotFoundError ? 404 : 400)
  }

  if (
    error instanceof DictionaryCodeConflictError ||
    error instanceof DictionaryItemValueConflictError
  ) {
    return c.json({ field: error.field, message: error.message }, 409)
  }

  throw error
}

export function createDictionaryRoutes(database: Db) {
  const service = createDictionaryService(database)
  const app = new Hono()

  app.onError((error, c) => dictionaryErrorResponse(error, c))

  return app
    .get('/', requireAccess('system:dictionary:list'), dictionaryListQueryValidator, async (c) => {
      const query: DictionaryListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/options', dictionaryOptionsQueryValidator, async (c) => {
      const query: DictionaryOptionsQuery = c.req.valid('query')

      return c.json(await service.options(query))
    })
    .get('/:id', requireAccess('system:dictionary:list'), dictionaryIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post(
      '/',
      requireAccess('system:dictionary:create'),
      dictionaryCreateBodyValidator,
      async (c) => {
        const body: DictionaryCreateInput = c.req.valid('json')

        return c.json(await service.create(body), 201)
      },
    )
    .put(
      '/:id',
      requireAccess('system:dictionary:update'),
      dictionaryIdValidator,
      dictionaryUpdateBodyValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        const body: DictionaryUpdateInput = c.req.valid('json')

        return c.json(await service.update(id, body))
      },
    )
    .delete('/:id', requireAccess('system:dictionary:delete'), dictionaryIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return c.body(null, 204)
    })
}
