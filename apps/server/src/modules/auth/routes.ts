import {
  type AuthLoginInput,
  type AuthRefreshInput,
  type AuthRegisterInput,
  authLogoutSchema,
  authRefreshSchema,
  authLoginSchema,
  authRegisterSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../db'
import { UserConflictError } from '../system/users/errors'
import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  setRefreshTokenCookie,
} from './cookies'
import { readAuthConfig } from './config'
import { AuthInvalidCredentialsError, AuthInvalidRefreshTokenError } from './errors'
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

async function readOptionalJson(c: Context) {
  const text = await c.req.text()

  if (!text.trim()) {
    return {}
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return {}
  }
}

async function readRefreshBody(c: Context): Promise<AuthRefreshInput> {
  const result = authRefreshSchema.safeParse(await readOptionalJson(c))

  if (!result.success) {
    throw new AuthInvalidRefreshTokenError()
  }

  return result.data
}

async function readLogoutBody(c: Context): Promise<AuthRefreshInput> {
  const result = authLogoutSchema.safeParse(await readOptionalJson(c))

  if (!result.success) {
    return {}
  }

  return result.data
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

  if (error instanceof AuthInvalidCredentialsError) {
    return c.json({ message: error.message }, 401)
  }

  if (error instanceof AuthInvalidRefreshTokenError) {
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
      const body = await readRefreshBody(c)
      const result = await service.refresh(body.refreshToken ?? getRefreshTokenCookie(c))

      setRefreshTokenCookie(c, result.refreshToken, config)

      return c.json(result)
    })
    .post('/logout', async (c) => {
      const body = await readLogoutBody(c)

      await service.logout(body.refreshToken ?? getRefreshTokenCookie(c))
      clearRefreshTokenCookie(c)

      return c.body(null, 204)
    })
}
