import {
  type ResourceCreateInput,
  type ResourceListQuery,
  type ResourceTreeOptionsQuery,
  type ResourceUpdateInput,
  resourceCreateSchema,
  resourceListQuerySchema,
  resourceSchema,
  resourceTreeOptionsQuerySchema,
  resourceUpdateSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import {
  ResourceConflictError,
  ResourceDeleteConflictError,
  ResourceInvalidParentError,
  ResourceRoleAuthorizationConflictError,
  ResourceInvalidTypeFieldsError,
  ResourceMoveConflictError,
  ResourceNotFoundError,
} from './errors'
import { createResourceService } from './service'

const resourceIdParamSchema = resourceSchema.pick({ id: true })
const resourceListRequestQuerySchema = resourceListQuerySchema
  .optional()
  .transform((query) => query ?? resourceListQuerySchema.parse({}))

const resourceIdValidator = zValidator('param', resourceIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '资源 ID 无效' }, 400)
  }
})

const resourceListQueryValidator = zValidator(
  'query',
  resourceListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)
const resourceTreeOptionsQueryValidator = zValidator(
  'query',
  resourceTreeOptionsQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

const resourceCreateBodyValidator = zValidator('json', resourceCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const resourceUpdateBodyValidator = zValidator('json', resourceUpdateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function resourceErrorResponse(error: unknown, c: Context) {
  if (error instanceof ResourceInvalidTypeFieldsError) {
    return c.json({ field: error.field, message: error.message }, 400)
  }

  if (error instanceof ResourceInvalidParentError) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof ResourceNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  if (
    error instanceof ResourceConflictError ||
    error instanceof ResourceMoveConflictError ||
    error instanceof ResourceDeleteConflictError ||
    error instanceof ResourceRoleAuthorizationConflictError
  ) {
    return c.json({ message: error.message }, 409)
  }

  throw error
}

export function createResourceRoutes(database: Db) {
  const service = createResourceService(database)
  const app = new Hono()

  app.onError((error, c) => resourceErrorResponse(error, c))

  return app
    .get('/', requireAccess('system:resource:list'), resourceListQueryValidator, async (c) => {
      const query: ResourceListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/tree', requireAccess('system:resource:list'), async (c) => c.json(await service.tree()))
    .get(
      '/options/tree',
      requireAccess('system:resource:list'),
      resourceTreeOptionsQueryValidator,
      async (c) => {
        const query: ResourceTreeOptionsQuery = c.req.valid('query')

        return c.json(await service.treeOptions(query))
      },
    )
    .get('/:id', requireAccess('system:resource:list'), resourceIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post('/', requireAccess('system:resource:create'), resourceCreateBodyValidator, async (c) => {
      const body: ResourceCreateInput = c.req.valid('json')

      return c.json(await service.create(body), 201)
    })
    .patch(
      '/:id',
      requireAccess('system:resource:update'),
      resourceIdValidator,
      resourceUpdateBodyValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        const body: ResourceUpdateInput = c.req.valid('json')

        return c.json(await service.update(id, body))
      },
    )
    .delete('/:id', requireAccess('system:resource:delete'), resourceIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return c.body(null, 204)
    })
}
