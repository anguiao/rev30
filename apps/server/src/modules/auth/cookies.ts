import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AuthConfig } from './config'

export const refreshTokenCookieName = 'refresh_token'

export function getRefreshTokenCookie(c: Context) {
  return getCookie(c, refreshTokenCookieName)
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

export function clearRefreshTokenCookie(c: Context) {
  deleteCookie(c, refreshTokenCookieName, {
    path: '/api/auth',
  })
}
