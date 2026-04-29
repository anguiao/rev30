import {
  type SystemUserCreateInput,
  type SystemUserListQuery,
  type SystemUserUpdateInput,
  systemUserCreateSchema,
  systemUserListQuerySchema,
  systemUserSchema,
  systemUserUpdateSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import {
  SystemUserConflictError,
  SystemUserNotFoundError,
  createSystemUserService,
} from './service'

const systemUserIdParamSchema = systemUserSchema.pick({ id: true })
const systemUserListRequestQuerySchema = systemUserListQuerySchema
  .optional()
  .transform((query) => query ?? systemUserListQuerySchema.parse({}))

const systemUserIdValidator = zValidator('param', systemUserIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: 'Invalid user id' }, 400)
  }
})

const systemUserListQueryValidator = zValidator(
  'query',
  systemUserListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: 'Invalid query' }, 400)
    }
  },
)

const systemUserCreateBodyValidator = zValidator('json', systemUserCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: 'Invalid body' }, 400)
  }
})

const systemUserUpdateBodyValidator = zValidator('json', systemUserUpdateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: 'Invalid body' }, 400)
  }
})

function serviceErrorResponse(c: Context, error: unknown) {
  if (error instanceof SystemUserConflictError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      409,
    )
  }

  if (error instanceof SystemUserNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createSystemUserRoutes(database: Db) {
  const service = createSystemUserService(database)

  return new Hono()
    .get('/', systemUserListQueryValidator, async (c) => {
      const query: SystemUserListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/:id', systemUserIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      try {
        return c.json(await service.get(id))
      } catch (error) {
        return serviceErrorResponse(c, error)
      }
    })
    .post('/', systemUserCreateBodyValidator, async (c) => {
      const body: SystemUserCreateInput = c.req.valid('json')

      try {
        return c.json(await service.create(body), 201)
      } catch (error) {
        return serviceErrorResponse(c, error)
      }
    })
    .patch('/:id', systemUserIdValidator, systemUserUpdateBodyValidator, async (c) => {
      const { id } = c.req.valid('param')
      const body: SystemUserUpdateInput = c.req.valid('json')

      try {
        return c.json(await service.update(id, body))
      } catch (error) {
        return serviceErrorResponse(c, error)
      }
    })
    .delete('/:id', systemUserIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      try {
        await service.delete(id)

        return new Response(null, { status: 204 })
      } catch (error) {
        return serviceErrorResponse(c, error)
      }
    })
}
