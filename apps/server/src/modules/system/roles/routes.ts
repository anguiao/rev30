import {
  type RoleCreateInput,
  type RoleListQuery,
  type RoleOptionsQuery,
  type RoleUpdateInput,
  roleCreateSchema,
  roleListQuerySchema,
  roleOptionsQuerySchema,
  roleSchema,
  roleUpdateSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import {
  BuiltInAdminRoleMutationError,
  RoleConflictError,
  RoleDeleteConflictError,
  RoleInvalidResourceError,
  RoleInvalidResourceAssignmentError,
  RoleNotFoundError,
} from './errors'
import { createRoleService } from './service'

const roleIdParamSchema = roleSchema.pick({ id: true })
const roleListRequestQuerySchema = roleListQuerySchema
  .optional()
  .transform((query) => query ?? roleListQuerySchema.parse({}))

const roleIdValidator = zValidator('param', roleIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '角色 ID 无效' }, 400)
  }
})

const roleListQueryValidator = zValidator('query', roleListRequestQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})

const roleOptionsQueryValidator = zValidator('query', roleOptionsQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})

const roleCreateBodyValidator = zValidator('json', roleCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const roleUpdateBodyValidator = zValidator('json', roleUpdateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function roleErrorResponse(error: unknown, c: Context) {
  if (error instanceof RoleInvalidResourceError) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof RoleInvalidResourceAssignmentError) {
    return c.json({ field: error.field, message: error.message }, 400)
  }

  if (error instanceof RoleNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  if (error instanceof RoleConflictError) {
    return c.json({ field: error.field, message: error.message }, 409)
  }

  if (error instanceof RoleDeleteConflictError || error instanceof BuiltInAdminRoleMutationError) {
    return c.json({ message: error.message }, 409)
  }

  throw error
}

export function createRoleRoutes(database: Db) {
  const service = createRoleService(database)
  const app = new Hono()

  app.onError((error, c) => roleErrorResponse(error, c))

  return app
    .get('/', requireAccess('system:role:list'), roleListQueryValidator, async (c) => {
      const query: RoleListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/options', requireAccess('system:role:list'), roleOptionsQueryValidator, async (c) => {
      const query: RoleOptionsQuery = c.req.valid('query')

      return c.json(await service.options(query))
    })
    .get('/:id', requireAccess('system:role:list'), roleIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post('/', requireAccess('system:role:create'), roleCreateBodyValidator, async (c) => {
      const body: RoleCreateInput = c.req.valid('json')

      return c.json(await service.create(body), 201)
    })
    .patch(
      '/:id',
      requireAccess('system:role:update'),
      roleIdValidator,
      roleUpdateBodyValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        const body: RoleUpdateInput = c.req.valid('json')

        return c.json(await service.update(id, body))
      },
    )
    .delete('/:id', requireAccess('system:role:delete'), roleIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return c.body(null, 204)
    })
}
