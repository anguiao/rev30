import { USER_STATUS_ENABLED } from '@rev30/contracts'
import { Hono } from 'hono'
import { rootErrorHandler } from '../../src/app'
import type { AuthEnv, AuthVariables } from '../../src/middleware/auth'
import { createOperationLogMiddleware } from '../../src/middleware/operation-log'
import {
  createRequestContextMiddleware,
  type RequestContextEnv,
} from '../../src/middleware/request-context'
import { createLogger } from '../../src/runtime/logger'
import type { OperationLogEvent } from '../../src/runtime/operation-log'
import { readTrustedProxyPolicy } from '../../src/runtime/trusted-proxy'

const logger = createLogger({ level: 'silent' })
const requestContext = createRequestContextMiddleware({
  logger,
  trustedProxyPolicy: readTrustedProxyPolicy({}),
})
const defaultUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'route-test-actor',
  nickname: 'Route Test Actor',
  avatarId: null,
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  builtIn: false,
  departments: [],
  roles: [],
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-06T00:00:00.000Z',
} satisfies AuthVariables['currentUser']

export function createOperationLogRouteTestApp(
  events: OperationLogEvent[],
  {
    currentUser = defaultUser,
    accessCodes = [],
    isAdmin = false,
  }: Partial<Pick<AuthVariables, 'currentUser' | 'accessCodes' | 'isAdmin'>> = {},
) {
  return new Hono<AuthEnv & RequestContextEnv>()
    .use('*', requestContext)
    .use(
      '*',
      createOperationLogMiddleware({
        receiver: (event) => events.push(event),
        logger,
      }),
    )
    .use('*', async (c, next) => {
      c.set('currentUser', currentUser)
      c.set('currentSessionId', '00000000-0000-4000-8000-000000000002')
      c.set('accessCodes', accessCodes)
      c.set('isAdmin', isAdmin)
      c.set('menus', [])
      await next()
    })
    .onError(rootErrorHandler)
}
