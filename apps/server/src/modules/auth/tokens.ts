import { createHash, randomUUID } from 'node:crypto'
import { fromUnixTimeSeconds, toUnixTimeSeconds } from '@rev30/utils'
import { sign, verify } from 'hono/jwt'
import { z } from 'zod'
import type { AuthConfig } from './config'
import {
  AuthAccessTokenExpiredError,
  AuthInvalidAccessTokenError,
  AuthInvalidRefreshTokenError,
} from './errors'

const tokenIdentitySchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
})
const accessTokenPayloadSchema = tokenIdentitySchema.extend({
  type: z.literal('access'),
  exp: z.number(),
})
const refreshTokenPayloadSchema = tokenIdentitySchema.extend({
  type: z.literal('refresh'),
  jti: z.string(),
})

export function hashRefreshTokenId(refreshTokenId: string) {
  return createHash('sha256').update(refreshTokenId).digest('hex')
}

export async function createTokenPair(
  userId: string,
  sessionId: string,
  config: AuthConfig,
  issuedAtDate = new Date(),
) {
  const issuedAt = toUnixTimeSeconds(issuedAtDate)
  const accessExpiresAt = issuedAt + config.accessExpiresInSeconds
  const refreshExpiresAt = issuedAt + config.refreshExpiresInSeconds
  const refreshTokenId = randomUUID()
  const refreshTokenHash = hashRefreshTokenId(refreshTokenId)
  const accessToken = await sign(
    {
      sub: userId,
      sid: sessionId,
      type: 'access',
      iat: issuedAt,
      exp: accessExpiresAt,
    },
    config.accessSecret,
    'HS256',
  )
  const refreshToken = await sign(
    {
      sub: userId,
      sid: sessionId,
      type: 'refresh',
      jti: refreshTokenId,
      iat: issuedAt,
      exp: refreshExpiresAt,
    },
    config.refreshSecret,
    'HS256',
  )

  return {
    accessToken,
    refreshToken,
    refreshTokenId,
    refreshTokenHash,
    refreshExpiresAt: fromUnixTimeSeconds(refreshExpiresAt),
    accessExpiresIn: config.accessExpiresInSeconds,
  }
}

async function verifyAccessTokenPayload(token: string, config: AuthConfig) {
  try {
    const payload = await verify(token, config.accessSecret, { alg: 'HS256', exp: false })
    const result = accessTokenPayloadSchema.safeParse(payload)

    if (!result.success) {
      throw new AuthInvalidAccessTokenError()
    }

    return result.data
  } catch {
    throw new AuthInvalidAccessTokenError()
  }
}

export async function verifyAccessToken(token: string, config: AuthConfig) {
  const payload = await verifyAccessTokenPayload(token, config)

  if (payload.exp <= toUnixTimeSeconds(new Date())) {
    throw new AuthAccessTokenExpiredError()
  }

  return { userId: payload.sub, sessionId: payload.sid }
}

export async function verifyAccessTokenAllowExpired(token: string, config: AuthConfig) {
  const payload = await verifyAccessTokenPayload(token, config)

  return { userId: payload.sub, sessionId: payload.sid }
}

export async function verifyRefreshToken(token: string, config: AuthConfig) {
  try {
    const payload = await verify(token, config.refreshSecret, 'HS256')
    const result = refreshTokenPayloadSchema.safeParse(payload)

    if (!result.success) {
      throw new AuthInvalidRefreshTokenError()
    }

    return {
      userId: result.data.sub,
      sessionId: result.data.sid,
      refreshTokenId: result.data.jti,
      refreshTokenHash: hashRefreshTokenId(result.data.jti),
    }
  } catch {
    throw new AuthInvalidRefreshTokenError()
  }
}
