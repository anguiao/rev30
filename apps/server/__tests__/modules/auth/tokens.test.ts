import { describe, expect, it } from 'vitest'
import type { AuthConfig } from '../../../src/modules/auth/config'
import {
  createTokenPair,
  hashRefreshTokenId,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../../src/modules/auth/tokens'

const config: AuthConfig = {
  accessSecret: 'test-access-secret',
  refreshSecret: 'test-refresh-secret',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
  secureCookies: false,
}

describe('auth token helpers', () => {
  it('creates and verifies access and refresh tokens with different secrets', async () => {
    const pair = await createTokenPair('8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7', config)

    expect(pair.accessToken).toEqual(expect.any(String))
    expect(pair.refreshToken).toEqual(expect.any(String))
    expect(pair.refreshTokenHash).toBe(hashRefreshTokenId(pair.refreshTokenId))
    expect(pair.accessExpiresIn).toBe(900)

    await expect(verifyAccessToken(pair.accessToken, config)).resolves.toEqual({
      userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    })
    await expect(verifyRefreshToken(pair.refreshToken, config)).resolves.toMatchObject({
      userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      refreshTokenId: pair.refreshTokenId,
      refreshTokenHash: pair.refreshTokenHash,
    })
    await expect(verifyAccessToken(pair.refreshToken, config)).rejects.toThrow('访问令牌无效')
  })
})
