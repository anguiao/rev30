import {
  type LoginLogListQuery,
  type OnlineSessionListQuery,
  loginLogListQuerySchema,
  loginLogListResponseSchema,
  onlineSessionListQuerySchema,
  onlineSessionListResponseSchema,
  onlineSessionRevokePathSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { Db } from '../../db'
import { requireAccess } from '../../middleware/access'
import type { AuthEnv } from '../../middleware/auth'
import { CurrentOnlineSessionConflictError, OnlineSessionNotFoundError } from './errors'
import { markOperationAudit, type OperationAuditRouteEnv } from './operation-logs/audit'
import { createOpsService } from './service'

const loginLogQueryValidator = zValidator('query', loginLogListQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求参数无效' }, 400)
  }
})
const onlineSessionQueryValidator = zValidator(
  'query',
  onlineSessionListQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求参数无效' }, 400)
    }
  },
)
const onlineSessionIdValidator = zValidator('param', onlineSessionRevokePathSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '会话 ID 无效' }, 400)
  }
})

function opsErrorResponse(error: unknown, c: Context) {
  if (error instanceof OnlineSessionNotFoundError) {
    return c.json({ message: error.message }, 404)
  }
  if (error instanceof CurrentOnlineSessionConflictError) {
    return c.json({ message: error.message }, 409)
  }
  throw error
}

export function createOpsRoutes(database: Db, authMiddleware: MiddlewareHandler<AuthEnv>) {
  const service = createOpsService(database)
  const app = new Hono<OperationAuditRouteEnv>().use('*', authMiddleware)

  app.onError((error, c) => opsErrorResponse(error, c))

  return app
    .get('/login-logs', requireAccess('ops:login-log:list'), loginLogQueryValidator, async (c) => {
      const query: LoginLogListQuery = c.req.valid('query')
      return c.json(loginLogListResponseSchema.parse(await service.listLoginLogs(query)))
    })
    .get(
      '/sessions',
      requireAccess('ops:online-session:list'),
      onlineSessionQueryValidator,
      async (c) => {
        const query: OnlineSessionListQuery = c.req.valid('query')
        return c.json(
          onlineSessionListResponseSchema.parse(
            await service.listOnlineSessions(query, c.get('currentSessionId')),
          ),
        )
      },
    )
    .delete(
      '/sessions/:id',
      requireAccess('ops:online-session:revoke'),
      onlineSessionIdValidator,
      async (c) => {
        const { id } = c.req.valid('param')

        markOperationAudit(c, 'ops:online-session:revoke', { targetKey: id })

        await service.revokeOnlineSession(id, c.get('currentSessionId'))
        return c.body(null, 204)
      },
    )
}
