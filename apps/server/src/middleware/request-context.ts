import type { HttpBindings } from '@hono/node-server'
import type { MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'
import {
  resolveClientIp,
  type ClientIpSource,
  type TrustedProxyPolicy,
} from '../runtime/trusted-proxy'

const requestIdHeader = 'X-Request-Id'
const maxUserAgentLength = 512

export type RequestContext = {
  requestId: string
  clientIp: string | null
  clientIpSource: ClientIpSource
  userAgent: string | null
  logger: Logger
}

export type RequestContextVariables = {
  requestContext: RequestContext
}

export type RequestContextEnv = {
  Bindings: Partial<HttpBindings>
  Variables: RequestContextVariables
}

type CreateRequestContextMiddlewareOptions = {
  logger: Logger
  trustedProxyPolicy: TrustedProxyPolicy
}

export function createRequestContextMiddleware({
  logger,
  trustedProxyPolicy,
}: CreateRequestContextMiddlewareOptions): MiddlewareHandler<RequestContextEnv> {
  return async (c, next) => {
    const requestId = crypto.randomUUID()
    const clientIp = resolveClientIp({
      socketAddress: c.env?.incoming?.socket.remoteAddress,
      trustedProxyPolicy,
      xForwardedFor: c.req.header('x-forwarded-for'),
    })
    const requestLogger = logger.child({
      clientIp: clientIp.clientIp,
      clientIpSource: clientIp.clientIpSource,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      requestId,
    })
    const requestContext: RequestContext = {
      clientIp: clientIp.clientIp,
      clientIpSource: clientIp.clientIpSource,
      logger: requestLogger,
      requestId,
      userAgent: normalizeUserAgent(c.req.header('user-agent')),
    }

    c.set('requestContext', requestContext)
    c.header(requestIdHeader, requestId)

    if (clientIp.forwardedForError) {
      const { hopCount, reason } = clientIp.forwardedForError

      requestLogger.warn(
        { ...(hopCount === undefined ? {} : { hopCount }), reason },
        'invalid X-Forwarded-For',
      )
    }

    await next()
    c.header(requestIdHeader, requestId)
  }
}

function normalizeUserAgent(value: string | undefined): string | null {
  const normalized = value?.trim()

  if (!normalized) {
    return null
  }

  return normalized.slice(0, maxUserAgentLength)
}
