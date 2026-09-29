import type { MiddlewareHandler } from 'hono'
import type { AuthEnv } from './auth'

export function requireAccess(code: string): MiddlewareHandler<AuthEnv> {
  return requireAnyAccess(code)
}

export function requireAnyAccess(...codes: string[]): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const currentUser = c.get('currentUser')
    const accessCodes = c.get('accessCodes')
    const isAdmin = c.get('isAdmin')

    if (!currentUser || !Array.isArray(accessCodes) || typeof isAdmin !== 'boolean') {
      return c.json({ message: '未授权' }, 401)
    }

    if (isAdmin || codes.some((code) => accessCodes.includes(code))) {
      await next()
      return
    }

    return c.json({ message: '无权访问' }, 403)
  }
}
