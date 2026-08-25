import {
  type UserCreateInput,
  type UserListQuery,
  type UserOptionsQuery,
  type UserUpdateInput,
  userCreateSchema,
  userListQuerySchema,
  userOptionsQuerySchema,
  userSchema,
  userUpdateSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import type { AuthEnv } from '../../../middleware/auth'
import { recordOperation, type OperationLogEnv } from '../../../middleware/operation-log'
import type { RequestContextEnv } from '../../../middleware/request-context'
import {
  BuiltInUserMutationError,
  UserConflictError,
  UserInvalidAvatarError,
  UserInvalidDepartmentError,
  UserInvalidRoleError,
  UserMutationForbiddenError,
  UserNotFoundError,
} from './errors'
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

const userOptionsQueryValidator = zValidator('query', userOptionsQuerySchema, (result, c) => {
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

  if (error instanceof UserInvalidAvatarError) {
    return c.json({ message: '请求体无效' }, 400)
  }

  if (error instanceof UserInvalidDepartmentError || error instanceof UserInvalidRoleError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      400,
    )
  }

  if (error instanceof BuiltInUserMutationError) {
    return c.json({ message: error.message }, 409)
  }

  if (error instanceof UserMutationForbiddenError) {
    return c.json({ message: error.message }, 403)
  }

  throw error
}

export function createUserRoutes(database: Db) {
  const service = createUserService(database)
  const app = new Hono<AuthEnv & RequestContextEnv & OperationLogEnv>()

  app.onError((error, c) => userErrorResponse(error, c))

  return app
    .get('/', requireAccess('system:user:list'), userListQueryValidator, async (c) => {
      const query: UserListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/options', requireAccess('system:user:list'), userOptionsQueryValidator, async (c) => {
      const query: UserOptionsQuery = c.req.valid('query')

      return c.json(await service.options(query))
    })
    .post('/', requireAccess('system:user:create'), userCreateBodyValidator, async (c) => {
      const body: UserCreateInput = c.req.valid('json')
      recordOperation(c, 'system:user:create', {
        targetKey: body.username,
        targetLabel: body.nickname,
      })

      return c.json(
        await service.create(body, {
          accessCodes: c.get('accessCodes'),
          isAdmin: c.get('isAdmin'),
        }),
        201,
      )
    })
    .post(
      '/:id/password/reset',
      requireAccess('system:user:reset-password'),
      userIdValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        recordOperation(c, 'system:user:reset-password', { targetKey: id })

        return c.json(
          await service.resetPassword(id, {
            accessCodes: c.get('accessCodes'),
            isAdmin: c.get('isAdmin'),
          }),
        )
      },
    )
    .get('/:id', requireAccess('system:user:list'), userIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .patch(
      '/:id',
      requireAccess('system:user:update'),
      userIdValidator,
      userUpdateBodyValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        const body: UserUpdateInput = c.req.valid('json')
        recordOperation(c, 'system:user:update', {
          targetKey: id,
          ...(body.nickname !== undefined ? { targetLabel: body.nickname } : {}),
        })

        return c.json(
          await service.update(id, body, {
            accessCodes: c.get('accessCodes'),
            isAdmin: c.get('isAdmin'),
          }),
        )
      },
    )
    .delete('/:id', requireAccess('system:user:delete'), userIdValidator, async (c) => {
      const { id } = c.req.valid('param')
      recordOperation(c, 'system:user:delete', { targetKey: id })

      await service.delete(id, {
        accessCodes: c.get('accessCodes'),
        isAdmin: c.get('isAdmin'),
      })

      return c.body(null, 204)
    })
}
