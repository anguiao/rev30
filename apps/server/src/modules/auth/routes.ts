import {
  type AuthLoginInput,
  type AuthRegisterInput,
  authLoginSchema,
  authRegisterSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { ZodType } from 'zod'
import type { Db } from '../../db'
import { createAuthMiddleware } from '../../middleware/auth'
import { UserConflictError } from '../system/users/errors'
import { clearRefreshTokenCookie, getRefreshTokenCookie, setRefreshTokenCookie } from './cookies'
import { readAuthConfig } from './config'
import { AuthInvalidCredentialsError, AuthInvalidRefreshTokenError } from './errors'
import { createAuthService } from './service'

const jsonBodyValidator = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求体无效' }, 400)
    }
  })

const registerBodyValidator = jsonBodyValidator(authRegisterSchema)
const loginBodyValidator = jsonBodyValidator(authLoginSchema)

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

  if (
    error instanceof AuthInvalidCredentialsError ||
    error instanceof AuthInvalidRefreshTokenError
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
    .post('/register', registerBodyValidator, async (c) => {
      const body: AuthRegisterInput = c.req.valid('json')
      const { refreshToken, ...session } = await service.register(body)

      setRefreshTokenCookie(c, refreshToken, config)

      return c.json(session, 201)
    })
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
    .get('/me', createAuthMiddleware(database), (c) => c.json(c.get('currentUser')))
}
