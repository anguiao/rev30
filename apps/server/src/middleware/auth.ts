import type { MiddlewareHandler } from 'hono'
import type { Db } from '../db'
import { parseBearerToken } from '../modules/auth/bearer'
import { readAuthConfig } from '../modules/auth/config'
import { AuthUnauthorizedError } from '../modules/auth/errors'
import { createAuthService } from '../modules/auth/service'

export function createAuthMiddleware(database: Db): MiddlewareHandler {
  const config = readAuthConfig()
  const service = createAuthService(database, config)

  return async (c, next) => {
    try {
      await service.me(parseBearerToken(c.req.header('authorization')))
    } catch (error) {
      if (error instanceof AuthUnauthorizedError) {
        return c.json({ message: error.message }, 401)
      }

      throw error
    }

    await next()
  }
}
