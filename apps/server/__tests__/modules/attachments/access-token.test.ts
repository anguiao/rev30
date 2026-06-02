import { describe, expect, it } from 'vitest'
import { sign } from 'hono/jwt'
import type { AuthConfig } from '../../../src/modules/auth/config'
import { AttachmentContentUnauthorizedError } from '../../../src/modules/attachments/errors'
import {
  createAttachmentAccessToken,
  verifyAttachmentAccessToken,
} from '../../../src/modules/attachments/access-token'
import { createTokenPair } from '../../../src/modules/auth/tokens'

const config: AuthConfig = {
  accessSecret: 'test-access-secret',
  refreshSecret: 'test-refresh-secret',
  attachmentSecret: 'test-attachment-secret',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
  attachmentExpiresInSeconds: 86400,
  secureCookies: false,
  loginFailureMaxAttempts: 5,
  loginFailureWindowSeconds: 900,
  loginFailureLockSeconds: 900,
}

describe('attachment access token helpers', () => {
  it('creates and verifies attachment access tokens', async () => {
    const userId = '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7'
    const token = await createAttachmentAccessToken(userId, config)

    await expect(verifyAttachmentAccessToken(token, config)).resolves.toEqual({ userId })
    await expect(
      verifyAttachmentAccessToken((await createTokenPair(userId, config)).accessToken, config),
    ).rejects.toBeInstanceOf(AttachmentContentUnauthorizedError)
  })

  it('rejects attachment access tokens without expiration', async () => {
    const token = await sign(
      {
        sub: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        type: 'attachment-access',
        iat: 1,
      },
      config.attachmentSecret,
      'HS256',
    )

    await expect(verifyAttachmentAccessToken(token, config)).rejects.toBeInstanceOf(
      AttachmentContentUnauthorizedError,
    )
  })
})
