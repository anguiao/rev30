import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'
import type { AuthConfig } from './config'

export const refreshTokenCookieName = 'refresh_token'
export const attachmentTokenCookieName = 'attachment_token'

export function getRefreshTokenCookie(c: Context) {
  return getCookie(c, refreshTokenCookieName)
}

export function getAttachmentTokenCookie(c: Context) {
  return getCookie(c, attachmentTokenCookieName)
}

export function setRefreshTokenCookie(c: Context, refreshToken: string, config: AuthConfig) {
  setCookie(c, refreshTokenCookieName, refreshToken, {
    httpOnly: true,
    maxAge: config.refreshExpiresInSeconds,
    path: '/api/auth',
    sameSite: 'lax',
    secure: config.secureCookies,
  })
}

export function setAttachmentTokenCookie(c: Context, attachmentToken: string, config: AuthConfig) {
  setCookie(c, attachmentTokenCookieName, attachmentToken, {
    httpOnly: true,
    maxAge: config.attachmentExpiresInSeconds,
    path: '/api/attachments',
    sameSite: 'lax',
    secure: config.secureCookies,
  })
}

export function clearRefreshTokenCookie(c: Context) {
  deleteCookie(c, refreshTokenCookieName, {
    path: '/api/auth',
  })
}

export function clearAttachmentTokenCookie(c: Context) {
  deleteCookie(c, attachmentTokenCookieName, {
    path: '/api/attachments',
  })
}
