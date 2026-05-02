import {
  type UserCreateInput,
  type UserListQuery,
  type UserUpdateInput,
  userCreateSchema,
  userListQuerySchema,
  userSchema,
  userUpdateSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { UserConflictError, UserNotFoundError } from './errors'
import { createUserService } from './service'

const userIdParamSchema = userSchema.pick({ id: true })
const userListRequestQuerySchema = userListQuerySchema
  .optional()
  .transform((query) => query ?? userListQuerySchema.parse({}))

const userIdValidator = zValidator('param', userIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '用户 ID 无效' }, 400)
  }
})

const userListQueryValidator = zValidator('query', userListRequestQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})

const userCreateBodyValidator = zValidator('json', userCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const userUpdateBodyValidator = zValidator('json', userUpdateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function userErrorResponse(error: unknown, c: Context) {
  if (error instanceof UserConflictError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      409,
    )
  }

  if (error instanceof UserNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createUserRoutes(database: Db) {
  const service = createUserService(database)
  const app = new Hono()

  app.onError((error, c) => userErrorResponse(error, c))

  return app
    .get('/', userListQueryValidator, async (c) => {
      const query: UserListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/:id', userIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post('/', userCreateBodyValidator, async (c) => {
      const body: UserCreateInput = c.req.valid('json')

      return c.json(await service.create(body), 201)
    })
    .patch('/:id', userIdValidator, userUpdateBodyValidator, async (c) => {
      const { id } = c.req.valid('param')
      const body: UserUpdateInput = c.req.valid('json')

      return c.json(await service.update(id, body))
    })
    .delete('/:id', userIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return new Response(null, { status: 204 })
    })
}
