import type { MiddlewareHandler } from 'hono'
import type { Db } from '../db'
import { readAuthConfig } from '../modules/auth/config'
import { AuthUnauthorizedError } from '../modules/auth/errors'
import { createAuthService } from '../modules/auth/service'

function bearerToken(authorization: string | undefined) {
  const parts = authorization?.split(' ') ?? []

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return undefined
  }

  return parts[1]
}

export function createAuthMiddleware(database: Db): MiddlewareHandler {
  const config = readAuthConfig()
  const service = createAuthService(database, config)

  return async (c, next) => {
    try {
      await service.me(bearerToken(c.req.header('authorization')))
    } catch (error) {
      if (error instanceof AuthUnauthorizedError) {
        return c.json({ message: error.message }, 401)
      }

      throw error
    }

    await next()
  }
}
