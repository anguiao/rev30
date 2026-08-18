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

const COOKIE_NAME = 'attachment_token'

function readSubject(payload: JwtPayload) {
  return typeof payload.sub === 'string' ? payload.sub : undefined
}

function readSessionId(payload: JwtPayload) {
  return typeof payload.sid === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sid)
    ? payload.sid
    : undefined
}

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
    const userId = readSubject(payload)
    const sessionId = readSessionId(payload)

    if (
      !userId ||
      !sessionId ||
      payload.type !== 'attachment-access' ||
      typeof payload.exp !== 'number'
    ) {
      throw new AttachmentContentUnauthorizedError()
    }

    return { userId, sessionId }
  } catch {
    throw new AttachmentContentUnauthorizedError()
  }
}
