import type { Context } from 'hono'
import { toUnixTimeSeconds } from '@rev30/utils'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { AuthConfig } from '../auth/config'
import { AttachmentContentUnauthorizedError } from './errors'

type AttachmentAccessTokenConfig = Pick<
  AuthConfig,
  'attachmentSecret' | 'attachmentExpiresInSeconds' | 'secureCookies'
>
type JwtPayload = Awaited<ReturnType<typeof verify>>

export const attachmentAccessTokenCookieName = 'attachment_token'

function readSubject(payload: JwtPayload) {
  return typeof payload.sub === 'string' ? payload.sub : undefined
}

export function getAttachmentAccessTokenCookie(c: Context) {
  return getCookie(c, attachmentAccessTokenCookieName)
}

export function setAttachmentAccessTokenCookie(
  c: Context,
  attachmentAccessToken: string,
  config: AttachmentAccessTokenConfig,
) {
  setCookie(c, attachmentAccessTokenCookieName, attachmentAccessToken, {
    httpOnly: true,
    maxAge: config.attachmentExpiresInSeconds,
    path: '/api/attachments',
    sameSite: 'lax',
    secure: config.secureCookies,
  })
}

export function clearAttachmentAccessTokenCookie(c: Context) {
  deleteCookie(c, attachmentAccessTokenCookieName, {
    path: '/api/attachments',
  })
}

export async function createAttachmentAccessToken(
  userId: string,
  config: AttachmentAccessTokenConfig,
) {
  const issuedAt = toUnixTimeSeconds(new Date())

  return sign(
    {
      sub: userId,
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
    const userId = readSubject(payload)

    if (!userId || payload.type !== 'attachment-access' || typeof payload.exp !== 'number') {
      throw new AttachmentContentUnauthorizedError()
    }

    return { userId }
  } catch {
    throw new AttachmentContentUnauthorizedError()
  }
}
