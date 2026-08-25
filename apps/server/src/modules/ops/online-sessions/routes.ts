import {
  type OnlineSessionListQuery,
  onlineSessionListQuerySchema,
  onlineSessionListResponseSchema,
  onlineSessionRevokePathSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import type { AuthEnv } from '../../../middleware/auth'
import { recordOperation, type OperationLogEnv } from '../../../middleware/operation-log'
import type { RequestContextEnv } from '../../../middleware/request-context'
import { CurrentOnlineSessionConflictError, OnlineSessionNotFoundError } from './errors'
import { createOnlineSessionService } from './service'

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

function onlineSessionErrorResponse(error: unknown, c: Context) {
  if (error instanceof OnlineSessionNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  if (error instanceof CurrentOnlineSessionConflictError) {
    return c.json({ message: error.message }, 409)
  }

  throw error
}

export function createOnlineSessionRoutes(database: Db) {
  const service = createOnlineSessionService(database)
  const app = new Hono<AuthEnv & RequestContextEnv & OperationLogEnv>()

  app.onError((error, c) => onlineSessionErrorResponse(error, c))

  return app
    .get('/', requireAccess('ops:online-session:list'), onlineSessionQueryValidator, async (c) => {
      const query: OnlineSessionListQuery = c.req.valid('query')

      return c.json(
        onlineSessionListResponseSchema.parse(await service.list(query, c.get('currentSessionId'))),
      )
    })
    .delete(
      '/:id',
      requireAccess('ops:online-session:revoke'),
      onlineSessionIdValidator,
      async (c) => {
        const { id } = c.req.valid('param')

        recordOperation(c, 'ops:online-session:revoke', { targetKey: id })

        await service.revoke(id, c.get('currentSessionId'))
        return c.body(null, 204)
      },
    )
}
