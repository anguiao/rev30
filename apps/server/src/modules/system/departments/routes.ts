import {
  type DepartmentCreateInput,
  type DepartmentListQuery,
  type DepartmentTreeOptionsQuery,
  type DepartmentUpdateInput,
  departmentCreateSchema,
  departmentListQuerySchema,
  departmentSchema,
  departmentTreeOptionsQuerySchema,
  departmentUpdateSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import {
  DepartmentConflictError,
  DepartmentDeleteConflictError,
  DepartmentInvalidParentError,
  DepartmentMoveConflictError,
  DepartmentNotFoundError,
} from './errors'
import { createDepartmentService } from './service'

const departmentIdParamSchema = departmentSchema.pick({ id: true })
const departmentListRequestQuerySchema = departmentListQuerySchema
  .optional()
  .transform((query) => query ?? departmentListQuerySchema.parse({}))

const departmentIdValidator = zValidator('param', departmentIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '部门 ID 无效' }, 400)
  }
})

const departmentListQueryValidator = zValidator(
  'query',
  departmentListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

const departmentTreeOptionsQueryValidator = zValidator(
  'query',
  departmentTreeOptionsQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

const departmentCreateBodyValidator = zValidator('json', departmentCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const departmentUpdateBodyValidator = zValidator('json', departmentUpdateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function departmentErrorResponse(error: unknown, c: Context) {
  if (error instanceof DepartmentInvalidParentError) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof DepartmentNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  if (error instanceof DepartmentConflictError) {
    return c.json({ field: error.field, message: error.message }, 409)
  }

  if (
    error instanceof DepartmentMoveConflictError ||
    error instanceof DepartmentDeleteConflictError
  ) {
    return c.json({ message: error.message }, 409)
  }

  throw error
}

export function createDepartmentRoutes(database: Db) {
  const service = createDepartmentService(database)
  const app = new Hono()

  app.onError((error, c) => departmentErrorResponse(error, c))

  return app
    .get('/', requireAccess('system:department:list'), departmentListQueryValidator, async (c) => {
      const query: DepartmentListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/tree', requireAccess('system:department:list'), async (c) =>
      c.json(await service.tree()),
    )
    .get(
      '/options/tree',
      requireAccess('system:department:list'),
      departmentTreeOptionsQueryValidator,
      async (c) => {
        const query: DepartmentTreeOptionsQuery = c.req.valid('query')

        return c.json(await service.treeOptions(query))
      },
    )
    .get('/:id', requireAccess('system:department:list'), departmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post(
      '/',
      requireAccess('system:department:create'),
      departmentCreateBodyValidator,
      async (c) => {
        const body: DepartmentCreateInput = c.req.valid('json')

        return c.json(await service.create(body), 201)
      },
    )
    .patch(
      '/:id',
      requireAccess('system:department:update'),
      departmentIdValidator,
      departmentUpdateBodyValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        const body: DepartmentUpdateInput = c.req.valid('json')

        return c.json(await service.update(id, body))
      },
    )
    .delete('/:id', requireAccess('system:department:delete'), departmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return c.body(null, 204)
    })
}
