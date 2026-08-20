import {
  type OperationLogListQuery,
  operationLogDetailPathSchema,
  operationLogDetailSchema,
  operationLogListQuerySchema,
  operationLogListResponseSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import type { OperationAuditRouteEnv } from './audit'
import { OperationLogNotFoundError } from './errors'
import { createOperationLogService } from './service'

const operationLogListRequestQuerySchema = operationLogListQuerySchema
  .optional()
  .transform((query) => query ?? operationLogListQuerySchema.parse({}))

const operationLogListQueryValidator = zValidator(
  'query',
  operationLogListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求参数无效' }, 400)
    }
  },
)

const operationLogIdValidator = zValidator('param', operationLogDetailPathSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '操作日志 ID 无效' }, 400)
  }
})

function operationLogErrorResponse(error: unknown, c: Context) {
  if (error instanceof OperationLogNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createOperationLogRoutes(database: Db) {
  const service = createOperationLogService(database)
  const app = new Hono<OperationAuditRouteEnv>()

  app.onError((error, c) => operationLogErrorResponse(error, c))

  return app
    .get(
      '/',
      requireAccess('ops:operation-log:list'),
      operationLogListQueryValidator,
      async (c) => {
        const query: OperationLogListQuery = c.req.valid('query')

        return c.json(operationLogListResponseSchema.parse(await service.list(query)))
      },
    )
    .get('/:id', requireAccess('ops:operation-log:list'), operationLogIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(operationLogDetailSchema.parse(await service.get(id)))
    })
}
