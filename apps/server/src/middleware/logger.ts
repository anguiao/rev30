import type { MiddlewareHandler } from 'hono'
import { logger as defaultLogger, type RequestLogger } from '../logger'

export type RequestLoggerOptions = {
  logger?: RequestLogger
  now?: () => number
}

function getRequestPath(url: string) {
  return new URL(url).pathname
}

export function createRequestLogger(options: RequestLoggerOptions = {}): MiddlewareHandler {
  const log = options.logger ?? defaultLogger
  const now = options.now ?? Date.now

  return async (c, next) => {
    const start = now()
    const request = {
      method: c.req.method,
      path: getRequestPath(c.req.url),
    }

    log.info(request, 'request started')

    try {
      await next()
      log.info(
        {
          ...request,
          durationMs: now() - start,
          status: c.res.status,
        },
        'request completed',
      )
    } catch (error) {
      log.error(
        {
          ...request,
          durationMs: now() - start,
          err: error,
        },
        'request failed',
      )
      throw error
    }
  }
}
