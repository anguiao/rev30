import type { Context } from 'hono'
import { toUnixTimeSeconds } from '@rev30/utils'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { z } from 'zod'
import type { AuthConfig } from '../auth/config'
import { AttachmentContentUnauthorizedError } from './errors'

type AttachmentAccessTokenConfig = Pick<
  AuthConfig,
  'attachmentSecret' | 'attachmentExpiresInSeconds' | 'secureCookies'
>

const COOKIE_NAME = 'attachment_token'
const attachmentAccessTokenPayloadSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  type: z.literal('attachment-access'),
  exp: z.number(),
})

export function getAttachmentAccessTokenCookie(c: Context) {
  return getCookie(c, COOKIE_NAME)
}

export function setAttachmentAccessTokenCookie(
  c: Context,
  attachmentAccessToken: string,
  config: AttachmentAccessTokenConfig,
) {
  setCookie(c, COOKIE_NAME, attachmentAccessToken, {
    httpOnly: true,
    maxAge: config.attachmentExpiresInSeconds,
    path: '/api/attachments',
    sameSite: 'lax',
    secure: config.secureCookies,
  })
}

export function clearAttachmentAccessTokenCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, {
    path: '/api/attachments',
  })
}

export async function createAttachmentAccessToken(
  userId: string,
  sessionId: string,
  config: AttachmentAccessTokenConfig,
  issuedAtDate = new Date(),
) {
  const issuedAt = toUnixTimeSeconds(issuedAtDate)

  return sign(
    {
      sub: userId,
      sid: sessionId,
      type: 'attachment-access',
      iat: issuedAt,
      exp: issuedAt + config.attachmentExpiresInSeconds,
    },
    config.attachmentSecret,
    'HS256',
  )
}

export async function verifyAttachmentAccessToken(
  token: string,
  config: AttachmentAccessTokenConfig,
) {
  try {
    const payload = await verify(token, config.attachmentSecret, 'HS256')
    const result = attachmentAccessTokenPayloadSchema.safeParse(payload)

    if (!result.success) {
      throw new AttachmentContentUnauthorizedError()
    }

    return { userId: result.data.sub, sessionId: result.data.sid }
  } catch {
    throw new AttachmentContentUnauthorizedError()
  }
}
