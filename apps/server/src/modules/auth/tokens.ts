import { createHash, randomUUID } from 'node:crypto'
import { sign, verify } from 'hono/jwt'
import type { AuthConfig } from './config'

type JwtPayload = {
  sub?: unknown
  type?: unknown
  jti?: unknown
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000)
}

function assertSubject(payload: JwtPayload) {
  if (typeof payload.sub !== 'string') {
    throw new Error('Invalid token subject')
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
  try {
    const payload = (await verify(token, config.accessSecret, 'HS256')) as JwtPayload
    const userId = assertSubject(payload)

    if (payload.type !== 'access') {
      throw new Error('Invalid access token')
    }

    return { userId }
  } catch {
    throw new Error('Invalid access token')
  }
}

export async function verifyRefreshToken(token: string, config: AuthConfig) {
  try {
    const payload = (await verify(token, config.refreshSecret, 'HS256')) as JwtPayload
    const userId = assertSubject(payload)

    if (payload.type !== 'refresh' || typeof payload.jti !== 'string') {
      throw new Error('Invalid refresh token')
    }

    return {
      userId,
      refreshTokenId: payload.jti,
      refreshTokenHash: hashRefreshTokenId(payload.jti),
    }
  } catch {
    throw new Error('Invalid refresh token')
  }
}
