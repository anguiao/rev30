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
}
const userId = '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7'
const sessionId = '5dfc90f3-9d4d-40f2-a8b9-f7d1863e5ad0'

describe('attachment access token helpers', () => {
  it('creates and verifies attachment access tokens', async () => {
    const token = await createAttachmentAccessToken(userId, sessionId, config)

    await expect(verifyAttachmentAccessToken(token, config)).resolves.toEqual({ userId, sessionId })
    await expect(
      verifyAttachmentAccessToken(
        (await createTokenPair(userId, sessionId, config)).accessToken,
        config,
      ),
    ).rejects.toBeInstanceOf(AttachmentContentUnauthorizedError)
  })

  it('rejects attachment access tokens without expiration', async () => {
    const token = await sign(
      {
        sub: userId,
        sid: sessionId,
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

  it('rejects attachment access tokens with malformed identity claims', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60

    for (const identity of [
      { sub: 'not-a-uuid', sid: sessionId },
      { sub: userId, sid: 'not-a-uuid' },
    ]) {
      const token = await sign(
        {
          ...identity,
          type: 'attachment-access',
          exp: expiresAt,
        },
        config.attachmentSecret,
        'HS256',
      )

      await expect(verifyAttachmentAccessToken(token, config)).rejects.toBeInstanceOf(
        AttachmentContentUnauthorizedError,
      )
    }
  })
})
