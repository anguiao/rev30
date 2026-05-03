import { createHash, randomUUID } from 'node:crypto'
import { sign, verify } from 'hono/jwt'
import type { AuthConfig } from './config'
import { AuthAccessTokenExpiredError, AuthInvalidAccessTokenError } from './errors'

type JwtPayload = {
  sub?: unknown
  type?: unknown
  jti?: unknown
  exp?: unknown
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000)
}

function assertSubject(payload: JwtPayload) {
  if (typeof payload.sub !== 'string') {
    throw new Error('令牌 subject 无效')
  }

  return payload.sub
}

export function hashRefreshTokenId(refreshTokenId: string) {
  return createHash('sha256').update(refreshTokenId).digest('hex')
}

export async function createTokenPair(userId: string, config: AuthConfig) {
  const issuedAt = nowInSeconds()
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
    refreshExpiresAt: new Date(refreshExpiresAt * 1000),
    accessExpiresIn: config.accessExpiresInSeconds,
  }
}

export async function verifyAccessToken(token: string, config: AuthConfig) {
  let payload: JwtPayload

  try {
    payload = (await verify(token, config.accessSecret, { alg: 'HS256', exp: false })) as JwtPayload
  } catch {
    throw new AuthInvalidAccessTokenError()
  }

  try {
    const userId = assertSubject(payload)

    if (payload.type !== 'access' || typeof payload.exp !== 'number') {
      throw new AuthInvalidAccessTokenError()
    }

    if (payload.exp <= nowInSeconds()) {
      throw new AuthAccessTokenExpiredError()
    }

    return { userId }
  } catch (error) {
    if (error instanceof AuthAccessTokenExpiredError) {
      throw error
    }

    throw new AuthInvalidAccessTokenError()
  }
}

export async function verifyRefreshToken(token: string, config: AuthConfig) {
  try {
    const payload = (await verify(token, config.refreshSecret, 'HS256')) as JwtPayload
    const userId = assertSubject(payload)

    if (payload.type !== 'refresh' || typeof payload.jti !== 'string') {
      throw new Error('刷新令牌无效')
    }

    return {
      userId,
      refreshTokenId: payload.jti,
      refreshTokenHash: hashRefreshTokenId(payload.jti),
    }
  } catch {
    throw new Error('刷新令牌无效')
  }
}
