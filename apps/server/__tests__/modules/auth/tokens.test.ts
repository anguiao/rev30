import { describe, expect, it } from 'vitest'
import { sign } from 'hono/jwt'
import type { AuthConfig } from '../../../src/modules/auth/config'
import {
  AuthAccessTokenExpiredError,
  AuthInvalidAccessTokenError,
  AuthInvalidRefreshTokenError,
} from '../../../src/modules/auth/errors'
import {
  createTokenPair,
  hashRefreshTokenId,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../../src/modules/auth/tokens'

const config: AuthConfig = {
  accessSecret: 'test-access-secret',
  refreshSecret: 'test-refresh-secret',
  attachmentSecret: 'test-attachment-secret',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
  attachmentExpiresInSeconds: 86400,
  secureCookies: false,
}
const userId = '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7'
const sessionId = '5dfc90f3-9d4d-40f2-a8b9-f7d1863e5ad0'

describe('auth token helpers', () => {
  it('creates and verifies access and refresh tokens with different secrets', async () => {
    const pair = await createTokenPair(userId, sessionId, config)

    expect(pair.accessToken).toEqual(expect.any(String))
    expect(pair.refreshToken).toEqual(expect.any(String))
    expect(pair.refreshTokenHash).toBe(hashRefreshTokenId(pair.refreshTokenId))
    expect(pair.accessExpiresIn).toBe(900)

    await expect(verifyAccessToken(pair.accessToken, config)).resolves.toEqual({
      userId,
      sessionId,
    })
    await expect(verifyRefreshToken(pair.refreshToken, config)).resolves.toMatchObject({
      userId,
      sessionId,
      refreshTokenId: pair.refreshTokenId,
      refreshTokenHash: pair.refreshTokenHash,
    })
    await expect(verifyAccessToken(pair.refreshToken, config)).rejects.toThrow('访问令牌无效')
  })

  it('rejects tokens with missing or malformed identity claims', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60
    const missingSessionId = await sign(
      { sub: userId, type: 'access', exp: expiresAt },
      config.accessSecret,
      'HS256',
    )
    const invalidSessionId = await sign(
      { sub: userId, sid: 'not-a-uuid', type: 'access', exp: expiresAt },
      config.accessSecret,
      'HS256',
    )
    const invalidUserId = await sign(
      { sub: 'not-a-uuid', sid: sessionId, type: 'access', exp: expiresAt },
      config.accessSecret,
      'HS256',
    )
    const invalidRefreshSessionId = await sign(
      {
        sub: userId,
        sid: 'not-a-uuid',
        type: 'refresh',
        jti: 'refresh-token-id',
        exp: expiresAt,
      },
      config.refreshSecret,
      'HS256',
    )

    await expect(verifyAccessToken(missingSessionId, config)).rejects.toBeInstanceOf(
      AuthInvalidAccessTokenError,
    )
    await expect(verifyAccessToken(invalidSessionId, config)).rejects.toBeInstanceOf(
      AuthInvalidAccessTokenError,
    )
    await expect(verifyAccessToken(invalidUserId, config)).rejects.toBeInstanceOf(
      AuthInvalidAccessTokenError,
    )
    await expect(verifyRefreshToken(invalidRefreshSessionId, config)).rejects.toBeInstanceOf(
      AuthInvalidRefreshTokenError,
    )
  })

  it('distinguishes expired access tokens from invalid access tokens', async () => {
    const expiredToken = await sign(
      {
        sub: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        sid: sessionId,
        type: 'access',
        iat: 1,
        exp: 2,
      },
      config.accessSecret,
      'HS256',
    )
    const invalidExpiredToken = await sign(
      {
        sub: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        sid: sessionId,
        type: 'access',
        iat: 1,
        exp: 2,
      },
      'wrong-access-secret',
      'HS256',
    )

    await expect(verifyAccessToken(expiredToken, config)).rejects.toBeInstanceOf(
      AuthAccessTokenExpiredError,
    )
    await expect(verifyAccessToken(invalidExpiredToken, config)).rejects.toBeInstanceOf(
      AuthInvalidAccessTokenError,
    )
  })
})
