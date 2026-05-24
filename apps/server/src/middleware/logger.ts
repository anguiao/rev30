import type { MiddlewareHandler } from 'hono'
import { logger } from '../runtime/logger'

function getRequestPath(url: string) {
  return new URL(url).pathname
}

export function createRequestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now()
    const request = {
      method: c.req.method,
      path: getRequestPath(c.req.url),
    }

    logger.info(request, 'request started')

    try {
      await next()
      logger.info(
        {
          ...request,
          durationMs: Date.now() - start,
          status: c.res.status,
        },
        'request completed',
      )
    } catch (error) {
      logger.error(
        {
          ...request,
          durationMs: Date.now() - start,
          err: error,
        },
        'request failed',
      )
      throw error
    }
  }
}
