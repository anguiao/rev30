import type { MiddlewareHandler } from 'hono'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  type AuthSessionResponse,
  type ResourceTreeNode,
  type User,
} from '@rev30/shared'
import type { Db } from '../db'
import { parseBearerToken } from '../modules/auth/bearer'
import { readAuthConfig } from '../modules/auth/config'
import { AuthAccessTokenExpiredError, AuthUnauthorizedError } from '../modules/auth/errors'
import { createAuthService } from '../modules/auth/service'

export type AuthVariables = {
  currentUser: User
  accessCodes: AuthSessionResponse['accessCodes']
  menus: ResourceTreeNode[]
  isAdmin: boolean
}

export type AuthEnv = {
  Variables: AuthVariables
}

export function createAuthMiddleware(database: Db): MiddlewareHandler<AuthEnv> {
  const config = readAuthConfig()
  const service = createAuthService(database, config)

  return async (c, next) => {
    try {
      const session = await service.me(parseBearerToken(c.req.header('authorization')))

      c.set('currentUser', session.user)
      c.set('accessCodes', session.accessCodes)
      c.set('menus', session.menus)
      c.set('isAdmin', session.isAdmin)
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
