import {
  type RoleCreateInput,
  type RoleListQuery,
  type RoleUpdateInput,
  roleCreateSchema,
  roleListQuerySchema,
  roleSchema,
  roleUpdateSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import {
  RoleConflictError,
  RoleDeleteConflictError,
  RoleInvalidResourceError,
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

  if (error instanceof RoleNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  if (error instanceof RoleConflictError || error instanceof RoleDeleteConflictError) {
    return c.json({ message: error.message }, 409)
  }

  throw error
}

export function createRoleRoutes(database: Db) {
  const service = createRoleService(database)
  const app = new Hono()

  app.onError((error, c) => roleErrorResponse(error, c))

  return app
    .get('/', roleListQueryValidator, async (c) => {
      const query: RoleListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/:id', roleIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post('/', roleCreateBodyValidator, async (c) => {
      const body: RoleCreateInput = c.req.valid('json')

      return c.json(await service.create(body), 201)
    })
    .patch('/:id', roleIdValidator, roleUpdateBodyValidator, async (c) => {
      const { id } = c.req.valid('param')
      const body: RoleUpdateInput = c.req.valid('json')

      return c.json(await service.update(id, body))
    })
    .delete('/:id', roleIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return c.body(null, 204)
    })
}
