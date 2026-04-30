import {
  type AuthLoginInput,
  type AuthRegisterInput,
  authLoginSchema,
  authRegisterSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../db'
import { UserConflictError } from '../system/users/errors'
import { setRefreshTokenCookie } from './cookies'
import { readAuthConfig } from './config'
import { AuthInvalidCredentialsError } from './errors'
import { createAuthService } from './service'

const registerBodyValidator = zValidator('json', authRegisterSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: 'Invalid body' }, 400)
  }
})

const loginBodyValidator = zValidator('json', authLoginSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: 'Invalid body' }, 400)
  }
})

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

  if (error instanceof AuthInvalidCredentialsError) {
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
      const result = await service.register(body)

      setRefreshTokenCookie(c, result.refreshToken, config)

      return c.json(result, 201)
    })
    .post('/login', loginBodyValidator, async (c) => {
      const body: AuthLoginInput = c.req.valid('json')
      const result = await service.login(body)

      setRefreshTokenCookie(c, result.refreshToken, config)

      return c.json(result)
    })
}
