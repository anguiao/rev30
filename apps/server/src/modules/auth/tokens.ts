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

function readSessionId(payload: JwtPayload) {
  return typeof payload.sid === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sid)
    ? payload.sid
    : undefined
}

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

export async function verifyAccessToken(token: string, config: AuthConfig) {
  let payload: JwtPayload

  try {
    payload = await verify(token, config.accessSecret, { alg: 'HS256', exp: false })
  } catch {
    throw new AuthInvalidAccessTokenError()
  }

  const userId = readSubject(payload)
  const sessionId = readSessionId(payload)

  if (!userId || !sessionId || payload.type !== 'access' || typeof payload.exp !== 'number') {
    throw new AuthInvalidAccessTokenError()
  }

  if (payload.exp <= toUnixTimeSeconds(new Date())) {
    throw new AuthAccessTokenExpiredError()
  }

  return { userId, sessionId }
}

export async function verifyAccessTokenAllowExpired(token: string, config: AuthConfig) {
  let payload: JwtPayload

  try {
    payload = await verify(token, config.accessSecret, { alg: 'HS256', exp: false })
  } catch {
    throw new AuthInvalidAccessTokenError()
  }

  const userId = readSubject(payload)
  const sessionId = readSessionId(payload)

  if (!userId || !sessionId || payload.type !== 'access' || typeof payload.exp !== 'number') {
    throw new AuthInvalidAccessTokenError()
  }

  return { userId, sessionId }
}

export async function verifyRefreshToken(token: string, config: AuthConfig) {
  try {
    const payload = await verify(token, config.refreshSecret, 'HS256')
    const userId = readSubject(payload)
    const sessionId = readSessionId(payload)

    if (!userId || !sessionId || payload.type !== 'refresh' || typeof payload.jti !== 'string') {
      throw new AuthInvalidRefreshTokenError()
    }

    return {
      userId,
      sessionId,
      refreshTokenId: payload.jti,
      refreshTokenHash: hashRefreshTokenId(payload.jti),
    }
  } catch {
    throw new AuthInvalidRefreshTokenError()
  }
}
