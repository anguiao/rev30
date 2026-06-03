import { createHash, randomUUID } from 'node:crypto'
import { fromUnixTimeSeconds, toUnixTimeSeconds } from '@rev30/utils'
import { sign, verify } from 'hono/jwt'
import type { AuthConfig } from './config'
import {
  AuthAccessTokenExpiredError,
  AuthInvalidAccessTokenError,
  AuthInvalidRefreshTokenError,
} from './errors'

type JwtPayload = Awaited<ReturnType<typeof verify>>

function readSubject(payload: JwtPayload) {
  return typeof payload.sub === 'string' ? payload.sub : undefined
}

export function hashRefreshTokenId(refreshTokenId: string) {
  return createHash('sha256').update(refreshTokenId).digest('hex')
}

export async function createTokenPair(userId: string, config: AuthConfig) {
  const issuedAt = toUnixTimeSeconds(new Date())
  const accessExpiresAt = issuedAt + config.accessExpiresInSeconds
  const refreshExpiresAt = issuedAt + config.refreshExpiresInSeconds
  const refreshTokenId = randomUUID()
  const refreshTokenHash = hashRefreshTokenId(refreshTokenId)
  const accessToken = await sign(
    {
      sub: userId,
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

export async function verifyAccessToken(token: string, config: AuthConfig) {
  let payload: JwtPayload

  try {
    payload = await verify(token, config.accessSecret, { alg: 'HS256', exp: false })
  } catch {
    throw new AuthInvalidAccessTokenError()
  }

  const userId = readSubject(payload)

  if (!userId || payload.type !== 'access' || typeof payload.exp !== 'number') {
    throw new AuthInvalidAccessTokenError()
  }

  if (payload.exp <= toUnixTimeSeconds(new Date())) {
    throw new AuthAccessTokenExpiredError()
  }

  return { userId }
}

export async function verifyRefreshToken(token: string, config: AuthConfig) {
  try {
    const payload = await verify(token, config.refreshSecret, 'HS256')
    const userId = readSubject(payload)

    if (!userId || payload.type !== 'refresh' || typeof payload.jti !== 'string') {
      throw new AuthInvalidRefreshTokenError()
    }

    return {
      userId,
      refreshTokenId: payload.jti,
      refreshTokenHash: hashRefreshTokenId(payload.jti),
    }
  } catch {
    throw new AuthInvalidRefreshTokenError()
  }
}
