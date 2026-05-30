import {
  type AuthLoginInput,
  type AuthPasswordUpdateInput,
  type AuthProfileUpdateInput,
  authLoginSchema,
  authPasswordUpdateSchema,
  authProfileUpdateSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { ZodType } from 'zod'
import type { Db } from '../../db'
import { createAuthMiddleware } from '../../middleware/auth'
import { UserConflictError, UserInvalidAvatarError } from '../system/users/errors'
import { clearRefreshTokenCookie, getRefreshTokenCookie, setRefreshTokenCookie } from './cookies'
import { readAuthConfig } from './config'
import {
  AuthInvalidCredentialsError,
  AuthInvalidCurrentPasswordError,
  AuthInvalidRefreshTokenError,
  AuthLoginRateLimitedError,
  AuthUnauthorizedError,
} from './errors'
import { createAuthService } from './service'

const jsonBodyValidator = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求体无效' }, 400)
    }
  })

const loginBodyValidator = jsonBodyValidator(authLoginSchema)
const profileUpdateBodyValidator = jsonBodyValidator(authProfileUpdateSchema)
const passwordUpdateBodyValidator = jsonBodyValidator(authPasswordUpdateSchema)

function authErrorResponse(error: unknown, c: Context) {
  if (error instanceof UserConflictError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      409,
    )
  }

  if (error instanceof UserInvalidAvatarError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      400,
    )
  }

  if (error instanceof AuthInvalidCurrentPasswordError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      400,
    )
  }

  if (error instanceof AuthLoginRateLimitedError) {
    return c.json({ message: error.message }, 429)
  }

  if (
    error instanceof AuthInvalidCredentialsError ||
    error instanceof AuthInvalidRefreshTokenError ||
    error instanceof AuthUnauthorizedError
  ) {
    return c.json({ message: error.message }, 401)
  }

  throw error
}

export function createAuthRoutes(database: Db) {
  const config = readAuthConfig()
  const service = createAuthService(database, config)
  const app = new Hono()

  app.onError((error, c) => authErrorResponse(error, c))

  return app
    .post('/login', loginBodyValidator, async (c) => {
      const body: AuthLoginInput = c.req.valid('json')
      const { refreshToken, ...session } = await service.login(body)

      setRefreshTokenCookie(c, refreshToken, config)

      return c.json(session)
    })
    .post('/refresh', async (c) => {
      const { refreshToken, ...session } = await service.refresh(getRefreshTokenCookie(c))
      setRefreshTokenCookie(c, refreshToken, config)

      return c.json(session)
    })
    .post('/logout', async (c) => {
      try {
        await service.logout(getRefreshTokenCookie(c))
      } finally {
        clearRefreshTokenCookie(c)
      }

      return c.body(null, 204)
    })
    .get('/me', createAuthMiddleware(database), (c) =>
      c.json({
        user: c.get('currentUser'),
        accessCodes: c.get('accessCodes'),
        menus: c.get('menus'),
      }),
    )
    .patch('/me/profile', createAuthMiddleware(database), profileUpdateBodyValidator, async (c) => {
      const body: AuthProfileUpdateInput = c.req.valid('json')

      return c.json(await service.updateProfile(c.get('currentUser').id, body))
    })
    .patch(
      '/me/password',
      createAuthMiddleware(database),
      passwordUpdateBodyValidator,
      async (c) => {
        const body: AuthPasswordUpdateInput = c.req.valid('json')

        await service.updatePassword(c.get('currentUser').id, body, getRefreshTokenCookie(c))

        return c.body(null, 204)
      },
    )
}
