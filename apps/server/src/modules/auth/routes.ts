import {
  type AuthLoginInput,
  type AuthPasswordUpdateInput,
  type AuthProfileUpdateInput,
  authLoginSchema,
  authPasswordUpdateSchema,
  authProfileUpdateSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { ZodType } from 'zod'
import type { Db } from '../../db'
import type { AuthEnv } from '../../middleware/auth'
import type { RequestContextEnv } from '../../middleware/request-context'
import { createBodyLimit } from '../../middleware/body-limit'
import {
  clearAttachmentAccessTokenCookie,
  setAttachmentAccessTokenCookie,
} from '../attachments/access-token'
import { UserConflictError, UserInvalidAvatarError } from '../system/users/errors'
import { clearRefreshTokenCookie, getRefreshTokenCookie, setRefreshTokenCookie } from './cookies'
import { parseBearerToken } from './bearer'
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

const authJsonBodyLimit = createBodyLimit(16 * 1024)

function toLoginRequestMetadata(requestContext: RequestContextEnv['Variables']['requestContext']) {
  const { requestId, clientIp, clientIpSource, userAgent } = requestContext
  return { requestId, clientIp, clientIpSource, userAgent }
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

  if (error instanceof UserInvalidAvatarError) {
    return c.json({ message: '请求体无效' }, 400)
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

export function createAuthRoutes(database: Db, authMiddleware: MiddlewareHandler<AuthEnv>) {
  const config = readAuthConfig()
  const service = createAuthService(database, config)
  const app = new Hono<AuthEnv & RequestContextEnv>()

  app.onError((error, c) => authErrorResponse(error, c))

  return app
    .post('/login', authJsonBodyLimit, loginBodyValidator, async (c) => {
      const body: AuthLoginInput = c.req.valid('json')
      const { refreshToken, attachmentAccessToken, ...session } = await service.login(
        body,
        toLoginRequestMetadata(c.get('requestContext')),
      )

      setRefreshTokenCookie(c, refreshToken, config)
      setAttachmentAccessTokenCookie(c, attachmentAccessToken, config)

      return c.json(session)
    })
    .post('/refresh', async (c) => {
      const { refreshToken, attachmentAccessToken, ...session } = await service.refresh(
        getRefreshTokenCookie(c),
        parseBearerToken(c.req.header('authorization')),
      )

      setRefreshTokenCookie(c, refreshToken, config)
      setAttachmentAccessTokenCookie(c, attachmentAccessToken, config)

      return c.json(session)
    })
    .post('/logout', async (c) => {
      try {
        await service.logout(
          parseBearerToken(c.req.header('authorization')),
          getRefreshTokenCookie(c),
        )
      } finally {
        clearRefreshTokenCookie(c)
        clearAttachmentAccessTokenCookie(c)
      }

      return c.body(null, 204)
    })
    .use('/me', authMiddleware)
    .use('/me/*', authMiddleware)
    .get('/me', (c) =>
      c.json({
        user: c.get('currentUser'),
        accessCodes: c.get('accessCodes'),
        menus: c.get('menus'),
      }),
    )
    .patch('/me/profile', authJsonBodyLimit, profileUpdateBodyValidator, async (c) => {
      const body: AuthProfileUpdateInput = c.req.valid('json')

      return c.json(await service.updateProfile(c.get('currentUser').id, body))
    })
    .patch('/me/password', authJsonBodyLimit, passwordUpdateBodyValidator, async (c) => {
      const body: AuthPasswordUpdateInput = c.req.valid('json')

      const { refreshToken, attachmentAccessToken, ...session } = await service.updatePassword(
        c.get('currentUser').id,
        c.get('currentSessionId'),
        body,
        toLoginRequestMetadata(c.get('requestContext')),
      )
      setRefreshTokenCookie(c, refreshToken, config)
      setAttachmentAccessTokenCookie(c, attachmentAccessToken, config)
      return c.json(session)
    })
}
