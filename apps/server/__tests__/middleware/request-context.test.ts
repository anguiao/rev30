import { once } from 'node:events'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rootErrorHandler } from '../../src/app'
import {
  createRequestContextMiddleware,
  type RequestContextEnv,
} from '../../src/middleware/request-context'
import { createRequestLogger } from '../../src/middleware/logger'
import { createLogger } from '../../src/runtime/logger'
import { readTrustedProxyPolicy, type TrustedProxyPolicy } from '../../src/runtime/trusted-proxy'

type LogRecord = Record<string, unknown>

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function createMemoryLogger() {
  const output: string[] = []
  const logger = createLogger({
    destination: {
      write(message) {
        output.push(message)
      },
    },
    level: 'trace',
  })

  return {
    logger,
    records() {
      return output.flatMap((chunk) =>
        chunk
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as LogRecord),
      )
    },
  }
}

function createTestApp(
  logger: Logger,
  trustedProxyPolicy: TrustedProxyPolicy = readTrustedProxyPolicy({}),
) {
  return new Hono<RequestContextEnv>()
    .use('*', createRequestContextMiddleware({ logger, trustedProxyPolicy }))
    .use('*', createRequestLogger())
    .onError(rootErrorHandler)
}

function findRecord(records: LogRecord[], message: string) {
  const record = records.find((candidate) => candidate.msg === message)

  if (!record) {
    throw new Error(`Missing ${message} record`)
  }

  return record
}

function nodeBindings(socketAddress: string) {
  return {
    incoming: {
      socket: {
        remoteAddress: socketAddress,
      },
    },
  } as never
}

async function closeServer(server: ReturnType<typeof serve>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

describe('request context middleware', () => {
  it('creates a server request ID, ignores an inbound ID, and reasserts it after downstream handlers', async () => {
    const memory = createMemoryLogger()
    const app = createTestApp(memory.logger).get('/context', (c) => {
      const requestContext = c.get('requestContext')
      c.header('X-Request-Id', 'downstream-value')

      return c.json({
        clientIp: requestContext.clientIp,
        clientIpSource: requestContext.clientIpSource,
        requestId: requestContext.requestId,
      })
    })

    const firstResponse = await app.request('/context', {
      headers: {
        'x-request-id': 'inbound-value',
      },
    })
    const secondResponse = await app.request('/context')
    const firstBody = (await firstResponse.json()) as { requestId: string }
    const secondBody = (await secondResponse.json()) as { requestId: string }

    expect(firstBody.requestId).toMatch(requestIdPattern)
    expect(secondBody.requestId).toMatch(requestIdPattern)
    expect(firstBody.requestId).not.toBe('inbound-value')
    expect(firstBody.requestId).not.toBe(secondBody.requestId)
    expect(firstResponse.headers.get('x-request-id')).toBe(firstBody.requestId)
    expect(secondResponse.headers.get('x-request-id')).toBe(secondBody.requestId)
  })

  it('uses unavailable client IP for in-memory requests and normalizes User-Agent values', async () => {
    const memory = createMemoryLogger()
    const app = createTestApp(memory.logger).get('/context', (c) => {
      const requestContext = c.get('requestContext')

      return c.json({
        clientIp: requestContext.clientIp,
        clientIpSource: requestContext.clientIpSource,
        userAgent: requestContext.userAgent,
      })
    })

    const emptyUserAgent = await app.request('/context', {
      headers: {
        'user-agent': '   ',
      },
    })
    const longUserAgent = await app.request('/context', {
      headers: {
        'user-agent': `  ${'a'.repeat(600)}  `,
      },
    })

    expect(await emptyUserAgent.json()).toEqual({
      clientIp: null,
      clientIpSource: 'unavailable',
      userAgent: null,
    })
    expect(await longUserAgent.json()).toEqual({
      clientIp: null,
      clientIpSource: 'unavailable',
      userAgent: 'a'.repeat(512),
    })
  })

  it('reads the actual Node socket and trusts X-Forwarded-For only through a trusted loopback proxy', async () => {
    const memory = createMemoryLogger()
    const app = createTestApp(
      memory.logger,
      readTrustedProxyPolicy({ TRUSTED_PROXY_CIDRS: '127.0.0.1/32' }),
    ).get('/context', (c) => {
      const requestContext = c.get('requestContext')

      return c.json({
        clientIp: requestContext.clientIp,
        clientIpSource: requestContext.clientIpSource,
      })
    })
    const server = serve({
      fetch: app.fetch,
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      if (!server.listening) {
        await once(server, 'listening')
      }

      const address = server.address()

      if (!address || typeof address === 'string') {
        throw new Error('Expected TCP server address')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/context`, {
        headers: {
          'x-forwarded-for': '198.51.100.42',
        },
      })

      expect(await response.json()).toEqual({
        clientIp: '198.51.100.42',
        clientIpSource: 'x-forwarded-for',
      })
    } finally {
      await closeServer(server)
    }
  })
})

describe('request logging middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('binds request fields to start and completion logs without recording request details', async () => {
    const memory = createMemoryLogger()
    const app = createTestApp(memory.logger).post('/logs', async (c) =>
      c.json({
        requestBody: await c.req.text(),
        responseBody: 'private-response-body',
      }),
    )

    const response = await app.request('/logs?attachmentToken=private-query-token', {
      body: 'private-request-body',
      headers: {
        'content-type': 'text/plain',
        'x-private-header': 'private-header-value',
        'user-agent': '  Request Context Test Agent  ',
      },
      method: 'POST',
    })
    const records = memory.records()
    const started = findRecord(records, 'request started')
    const completed = findRecord(records, 'request completed')

    expect(response.status).toBe(200)
    expect(started).toMatchObject({
      clientIp: null,
      clientIpSource: 'unavailable',
      method: 'POST',
      path: '/logs',
      userAgent: 'Request Context Test Agent',
    })
    expect(completed).toMatchObject({
      clientIp: null,
      clientIpSource: 'unavailable',
      method: 'POST',
      path: '/logs',
      status: 200,
    })
    expect(completed).not.toHaveProperty('userAgent')
    expect(started.requestId).toMatch(requestIdPattern)
    expect(completed.requestId).toBe(started.requestId)
    expect(completed.durationMs).toEqual(expect.any(Number))
    expect(JSON.stringify(records)).not.toContain('private-query-token')
    expect(JSON.stringify(records)).not.toContain('private-request-body')
    expect(JSON.stringify(records)).not.toContain('private-response-body')
    expect(JSON.stringify(records)).not.toContain('private-header-value')
  })

  it('writes one failed event for unknown errors without calling console.error', async () => {
    const memory = createMemoryLogger()
    const error = new Error('unexpected failure')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const app = createTestApp(memory.logger).get('/failure', () => {
      throw error
    })

    const response = await app.request('/failure')
    const records = memory.records()
    const failures = records.filter((record) => record.msg === 'request failed')

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Server Error')
    expect(response.headers.get('content-type')).toBe('text/plain; charset=UTF-8')
    expect(response.headers.get('x-request-id')).toMatch(requestIdPattern)
    expect(consoleError).not.toHaveBeenCalled()
    expect(records.filter((record) => record.msg === 'request completed')).toHaveLength(0)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      clientIp: null,
      clientIpSource: 'unavailable',
      method: 'GET',
      path: '/failure',
      status: 500,
    })
    expect(failures[0]?.err).toMatchObject({
      message: 'unexpected failure',
      type: 'Error',
    })
  })

  it('keeps HTTPException responses intact while preserving the request ID header', async () => {
    const memory = createMemoryLogger()
    const app = createTestApp(memory.logger).get('/teapot', () => {
      throw new HTTPException(418, {
        res: new Response('short and stout', {
          headers: {
            'x-original-error-header': 'preserved',
          },
          status: 418,
        }),
      })
    })

    const response = await app.request('/teapot')

    expect(response.status).toBe(418)
    expect(response.headers.get('x-original-error-header')).toBe('preserved')
    expect(response.headers.get('x-request-id')).toMatch(requestIdPattern)
    expect(await response.text()).toBe('short and stout')
  })

  it('does not trust response-like unknown errors', async () => {
    const memory = createMemoryLogger()
    const getResponse = vi.fn(() => new Response('should not be returned', { status: 418 }))
    const error = Object.assign(new Error('unexpected failure'), { getResponse })
    const app = createTestApp(memory.logger).get('/failure', () => {
      throw error
    })

    const response = await app.request('/failure')

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Server Error')
    expect(getResponse).not.toHaveBeenCalled()
  })

  it('records a mapped domain 4xx as completed even when Hono retains c.error', async () => {
    class DomainError extends Error {}

    const memory = createMemoryLogger()
    const domainRoutes = new Hono()
      .onError((error, c) => {
        if (error instanceof DomainError) {
          return c.json({ message: 'domain failure' }, 422)
        }

        throw error
      })
      .get('/domain-error', () => {
        throw new DomainError('domain failure')
      })
    const app = createTestApp(memory.logger).route('/api', domainRoutes)

    const response = await app.request('/api/domain-error')
    const records = memory.records()

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ message: 'domain failure' })
    expect(records.filter((record) => record.msg === 'request completed')).toHaveLength(1)
    expect(records.filter((record) => record.msg === 'request failed')).toHaveLength(0)
  })

  it('does not read or wrap streaming response bodies before recording completion', async () => {
    const memory = createMemoryLogger()
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('stream response'))
        controller.close()
      },
    })
    const app = createTestApp(memory.logger).get('/stream', (c) => c.body(stream))

    const response = await app.request('/stream')

    expect(response.body).toBe(stream)
    expect(response.body?.locked).toBe(false)
    expect(memory.records().filter((record) => record.msg === 'request completed')).toHaveLength(1)
    expect(await response.text()).toBe('stream response')
  })

  it('logs invalid forwarded chains without recording the original header', async () => {
    const memory = createMemoryLogger()
    const policy = readTrustedProxyPolicy({ TRUSTED_PROXY_CIDRS: '10.0.0.0/8' })
    const forwardedFor = '198.51.100.42, invalid-proxy.example'
    const app = createTestApp(memory.logger, policy).get('/context', (c) => {
      const requestContext = c.get('requestContext')

      return c.json({
        clientIp: requestContext.clientIp,
        clientIpSource: requestContext.clientIpSource,
      })
    })

    const response = await app.request(
      '/context',
      {
        headers: {
          'x-forwarded-for': forwardedFor,
        },
      },
      nodeBindings('10.0.0.3'),
    )
    const records = memory.records()
    const warning = findRecord(records, 'invalid X-Forwarded-For')

    expect(await response.json()).toEqual({
      clientIp: '10.0.0.3',
      clientIpSource: 'socket',
    })
    expect(warning).toMatchObject({
      hopCount: 2,
      reason: 'invalid-ip',
    })
    expect(JSON.stringify(records)).not.toContain(forwardedFor)
  })
})
