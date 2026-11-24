import {
  type LoginLogListQuery,
  loginLogListQuerySchema,
  loginLogListResponseSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import type { AuthEnv } from '../../../middleware/auth'
import { operationLog, type OperationLogEnv } from '../../../middleware/operation-log'
import type { RequestContextEnv } from '../../../middleware/request-context'
import { createLoginLogService } from './service'

const loginLogQueryValidator = zValidator('query', loginLogListQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求参数无效' }, 400)
  }
})

export function createLoginLogRoutes(database: Db) {
  const service = createLoginLogService(database)

  return new Hono<AuthEnv & RequestContextEnv & OperationLogEnv>().get(
    '/',
    requireAccess('ops:login-log:list'),
    loginLogQueryValidator,
    operationLog('ops:login-log:list'),
    async (c) => {
      const query: LoginLogListQuery = c.req.valid('query')

      return c.json(loginLogListResponseSchema.parse(await service.list(query)))
    },
  )
}
