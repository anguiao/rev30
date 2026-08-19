import { Hono, type ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'pino'
import type { Db } from './db'
import { createAuthMiddleware } from './middleware/auth'
import { createJsonBodyLimit } from './middleware/body-limit'
import { createRequestLogger } from './middleware/logger'
import {
  createRequestContextMiddleware,
  type RequestContextEnv,
} from './middleware/request-context'
import { createAttachmentRoutes } from './modules/attachments/routes'
import { createAuthRoutes } from './modules/auth/routes'
import { createContentRoutes } from './modules/content/routes'
import { createDemoRoutes } from './modules/demos/routes'
import { healthRoutes } from './modules/health/routes'
import { createIconRoutes } from './modules/icons/routes'
import { createIconSearchRoutes } from './modules/icons/search/routes'
import { createOpsRoutes } from './modules/ops/routes'
import { createSystemRoutes } from './modules/system/routes'
import { logger } from './runtime/logger'
import { readTrustedProxyPolicy, type TrustedProxyPolicy } from './runtime/trusted-proxy'

export type CreateAppOptions = {
  logger?: Logger
  trustedProxyPolicy?: TrustedProxyPolicy
}

export function createApiRoutes(database: Db) {
  const apiJsonBodyLimit = createJsonBodyLimit(5 * 1024 * 1024)
  const authMiddleware = createAuthMiddleware(database)

  return new Hono()
    .use('*', apiJsonBodyLimit)
    .route('/', healthRoutes)
    .route('/auth', createAuthRoutes(database, authMiddleware))
    .route('/icons/search', createIconSearchRoutes(database, authMiddleware))
    .route('/icons', createIconRoutes(database))
    .route('/attachments', createAttachmentRoutes(database, authMiddleware))
    .route('/ops', createOpsRoutes(database, authMiddleware))
    .route('/system', createSystemRoutes(database, authMiddleware))
    .route('/content', createContentRoutes(database, authMiddleware))
    .route('/demos', createDemoRoutes(authMiddleware))
}

export const rootErrorHandler: ErrorHandler<RequestContextEnv> = (error, c) => {
  if (error instanceof HTTPException) {
    const response = error.getResponse()

    return c.newResponse(response.body, response)
  }

  return c.text('Internal Server Error', 500)
}

export function createApp(database: Db, options: CreateAppOptions = {}) {
  const appLogger = options.logger ?? logger
  const trustedProxyPolicy = options.trustedProxyPolicy ?? readTrustedProxyPolicy({})

  return new Hono<RequestContextEnv>()
    .use('*', createRequestContextMiddleware({ logger: appLogger, trustedProxyPolicy }))
    .use('*', createRequestLogger())
    .onError(rootErrorHandler)
    .route('/api', createApiRoutes(database))
}

export type AppType = ReturnType<typeof createApiRoutes>
