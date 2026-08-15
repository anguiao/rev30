import type { MiddlewareHandler } from 'hono'
import type { RequestContextEnv } from './request-context'

export function createRequestLogger(): MiddlewareHandler<RequestContextEnv> {
  return async (c, next) => {
    const start = Date.now()
    const requestContext = c.get('requestContext')

    requestContext.logger.info({ userAgent: requestContext.userAgent }, 'request started')

    await next()

    const requestResult = {
      durationMs: Date.now() - start,
      status: c.res.status,
    }

    if (c.error && c.res.status >= 500) {
      requestContext.logger.error(
        {
          ...requestResult,
          err: c.error,
        },
        'request failed',
      )
      return
    }

    requestContext.logger.info(requestResult, 'request completed')
  }
}
