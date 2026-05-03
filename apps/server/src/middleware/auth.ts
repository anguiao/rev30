import type { MiddlewareHandler } from 'hono'
import { AUTH_ACTION_HEADER, AUTH_ACTION_REFRESH } from '@rev30/shared'
import type { Db } from '../db'
import { parseBearerToken } from '../modules/auth/bearer'
import { readAuthConfig } from '../modules/auth/config'
import { AuthAccessTokenExpiredError, AuthUnauthorizedError } from '../modules/auth/errors'
import { createAuthService } from '../modules/auth/service'

export function createAuthMiddleware(database: Db): MiddlewareHandler {
  const config = readAuthConfig()
  const service = createAuthService(database, config)

  return async (c, next) => {
    try {
      await service.me(parseBearerToken(c.req.header('authorization')))
    } catch (error) {
      if (error instanceof AuthAccessTokenExpiredError) {
        c.header(AUTH_ACTION_HEADER, AUTH_ACTION_REFRESH)

        return c.json({ message: '未授权' }, 401)
      }

      if (error instanceof AuthUnauthorizedError) {
        return c.json({ message: error.message }, 401)
      }

      throw error
    }

    await next()
  }
}
