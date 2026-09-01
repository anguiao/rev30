import { Hono, type MiddlewareHandler } from 'hono'
import type { Db } from '../../db'
import type { AuthEnv } from '../../middleware/auth'
import { createLoginLogRoutes } from './login-logs/routes'
import { createOnlineSessionRoutes } from './online-sessions/routes'
import { createOperationLogRoutes } from './operation-logs/routes'
import { createScheduledJobRoutes } from './scheduled-jobs/routes'
import type { ScheduledJobService } from './scheduled-jobs/service'

export function createOpsRoutes(
  database: Db,
  authMiddleware: MiddlewareHandler<AuthEnv>,
  scheduledJobService: ScheduledJobService,
) {
  return new Hono<AuthEnv>()
    .use('*', authMiddleware)
    .route('/login-logs', createLoginLogRoutes(database))
    .route('/sessions', createOnlineSessionRoutes(database))
    .route('/operation-logs', createOperationLogRoutes(database))
    .route('/scheduled-jobs', createScheduledJobRoutes(scheduledJobService))
}
