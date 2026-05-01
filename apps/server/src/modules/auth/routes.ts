import {
  type AuthLoginInput,
  type AuthRegisterInput,
  authRefreshTokenRequestSchema,
  authLoginSchema,
  authRegisterSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { ZodType } from 'zod'
import type { Db } from '../../db'
import { UserConflictError } from '../system/users/errors'
import { clearRefreshTokenCookie, getRefreshTokenCookie, setRefreshTokenCookie } from './cookies'
import { readAuthConfig } from './config'
import {
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
  AuthUnauthorizedError,
} from './errors'
import { createAuthService } from './service'

const jsonBodyValidator = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({ message: 'Invalid body' }, 400)
    }
  })

const registerBodyValidator = jsonBodyValidator(authRegisterSchema)
const loginBodyValidator = jsonBodyValidator(authLoginSchema)

async function readRefreshToken(c: Context) {
  try {
    const text = await c.req.text()
    const body = authRefreshTokenRequestSchema.safeParse(text.trim() ? JSON.parse(text) : {})

    return body.success ? (body.data.refreshToken ?? getRefreshTokenCookie(c)) : null
  } catch {
    return null
  }
}

function bearerToken(c: Context) {
  const authorization = c.req.header('authorization')
  const [scheme, token] = authorization?.split(' ') ?? []

  if (scheme !== 'Bearer' || !token) {
    return undefined
  }

  return token
}

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
    .post('/refresh', async (c) => {
      const refreshToken = await readRefreshToken(c)

      if (refreshToken === null) {
        return c.json({ message: 'Invalid body' }, 400)
      }

      const result = await service.refresh(refreshToken)
      setRefreshTokenCookie(c, result.refreshToken, config)

      return c.json(result)
    })
    .post('/logout', async (c) => {
      const refreshToken = await readRefreshToken(c)

      if (refreshToken === null) {
        return c.json({ message: 'Invalid body' }, 400)
      }

      await service.logout(refreshToken)
      clearRefreshTokenCookie(c)

      return c.body(null, 204)
    })
    .get('/me', async (c) => c.json(await service.me(bearerToken(c))))
}
