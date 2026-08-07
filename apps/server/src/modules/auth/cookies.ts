import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AuthConfig } from './config'

const COOKIE_NAME = 'refresh_token'

export function getRefreshTokenCookie(c: Context) {
  return getCookie(c, COOKIE_NAME)
}

export function setRefreshTokenCookie(c: Context, refreshToken: string, config: AuthConfig) {
  setCookie(c, COOKIE_NAME, refreshToken, {
    httpOnly: true,
    maxAge: config.refreshExpiresInSeconds,
    path: '/api/auth',
    sameSite: 'lax',
    secure: config.secureCookies,
  })
}

export function clearRefreshTokenCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, {
    path: '/api/auth',
  })
}
