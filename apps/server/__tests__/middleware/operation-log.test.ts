import type { OperationLogAction } from '@rev30/contracts'
import { Hono } from 'hono'
import type { Logger } from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rootErrorHandler } from '../../src/app'
import type { AuthEnv, AuthVariables } from '../../src/middleware/auth'
import {
  createOperationLogMiddleware,
  recordOperation,
  type OperationLogEnv,
} from '../../src/middleware/operation-log'
import type { RequestContextEnv } from '../../src/middleware/request-context'
import type { OperationLogEvent, OperationLogEventReceiver } from '../../src/runtime/operation-log'

type TestEnv = AuthEnv & RequestContextEnv & OperationLogEnv

function createLoggerSpy() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger
}

function createTestApp(options: {
  events: OperationLogEvent[]
  logger: Logger
  receiver?: OperationLogEventReceiver
}) {
  const app = new Hono<TestEnv>()
    .use('*', async (c, next) => {
      c.set('requestContext', {
        requestId: '10000000-0000-4000-8000-000000000003',
        clientIp: '192.0.2.1',
        clientIpSource: 'x-forwarded-for',
        userAgent: 'Example/1.0',
        logger: {} as Logger,
      })
      c.set('currentUser', {
        id: '10000000-0000-4000-8000-000000000001',
        username: 'a'.repeat(600),
        nickname: 'n'.repeat(600),
      } as AuthVariables['currentUser'])
      c.set('currentSessionId', '10000000-0000-4000-8000-000000000002')
      c.set('accessCodes', [])
      c.set('menus', [])
      c.set('isAdmin', true)
      await next()
    })
    .use(
      '*',
      createOperationLogMiddleware({
        logger: options.logger,
        receiver:
          options.receiver ??
          ((event) => {
            options.events.push(event)
          }),
      }),
    )
    .onError(rootErrorHandler)

  return app
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('operation log registration and middleware', () => {
  it('captures a normalized immutable event after the final successful response', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    let monotonicTime = 10
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T00:00:00.000Z'))
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime)
    const app = createTestApp({ events, logger }).post('/success', (c) => {
      recordOperation(c, 'system:user:update', {
        targetKey: `  ${'k'.repeat(600)}  `,
        targetLabel: '  Ada  ',
      })
      monotonicTime = 22.9

      return c.json({ secret: 'response-secret' })
    })

    const response = await app.request('/success', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ secret: 'response-secret' })
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      actorIsAdmin: true,
      actorNickname: `${'n'.repeat(511)}…`,
      actorSessionId: '10000000-0000-4000-8000-000000000002',
      actorUserId: '10000000-0000-4000-8000-000000000001',
      actorUsername: `${'a'.repeat(511)}…`,
      action: 'system:user:update',
      clientIp: '192.0.2.1',
      clientIpSource: 'x-forwarded-for',
      createdAt: '2026-08-19T00:00:00.000Z',
      durationMs: 12,
      httpStatus: 200,
      module: 'system',
      requestId: '10000000-0000-4000-8000-000000000003',
      result: 'success',
      targetKey: `${'k'.repeat(511)}…`,
      targetLabel: 'Ada',
      targetType: 'user',
      userAgent: 'Example/1.0',
    })
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('truncates Unicode code points and line breaks without discarding the event', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    const unicodeValue = '😀'.repeat(520)
    const multilineValue = `${'a\n'.repeat(300)}a`
    const app = createTestApp({ events, logger }).post('/unicode', (c) => {
      recordOperation(c, 'system:user:update', {
        targetKey: unicodeValue,
        targetLabel: multilineValue,
      })

      return c.json({ ok: true })
    })

    const response = await app.request('/unicode', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      targetKey: `${'😀'.repeat(511)}…`,
      targetLabel: `${Array.from(multilineValue).slice(0, 511).join('')}…`,
    })
    expect(Array.from(events[0]!.targetKey ?? '')).toHaveLength(512)
    expect(Array.from(events[0]!.targetLabel ?? '')).toHaveLength(512)
  })

  it('uses the final 4xx and 500 responses without exposing response bodies', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    let monotonicTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime)
    const app = createTestApp({ events, logger })
      .post('/failure', (c) => {
        recordOperation(c, 'system:user:delete', { targetKey: 'user-1' })
        monotonicTime = 5
        return c.json({ password: 'domain-secret' }, 409)
      })
      .post('/unknown', (c) => {
        recordOperation(c, 'system:user:delete', { targetKey: 'user-2' })
        monotonicTime = 9
        throw new Error('database-password-secret')
      })

    const failureResponse = await app.request('/failure', { method: 'POST' })
    const unknownResponse = await app.request('/unknown', { method: 'POST' })

    expect(failureResponse.status).toBe(409)
    expect(unknownResponse.status).toBe(500)
    expect(
      events.map(({ result, httpStatus, durationMs }) => ({ result, httpStatus, durationMs })),
    ).toEqual([
      { result: 'failure', httpStatus: 409, durationMs: 5 },
      { result: 'failure', httpStatus: 500, durationMs: 4 },
    ])
    expect(JSON.stringify(events)).not.toContain('domain-secret')
    expect(JSON.stringify(events)).not.toContain('database-password-secret')
  })

  it('discards missing targets, invalid registrations and duplicate registrations without changing responses', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    const app = createTestApp({ events, logger })
      .post('/empty', (c) => {
        recordOperation(c, 'system:user:update', { targetKey: ' ', targetLabel: '' })
        return c.text('empty-ok')
      })
      .post('/invalid', (c) => {
        recordOperation(c, 'invalid:action' as OperationLogAction, {
          targetKey: 'secret-target',
        })
        return c.text('invalid-ok')
      })
      .post('/extra', (c) => {
        recordOperation(c, 'system:user:update', {
          targetKey: 'secret-target',
          extra: 'secret-extra',
        } as never)
        return c.text('extra-ok')
      })
      .post('/duplicate', (c) => {
        recordOperation(c, 'system:user:update', { targetKey: 'first-secret' })
        recordOperation(c, 'system:user:delete', { targetKey: 'second-secret' })
        return c.text('duplicate-ok')
      })

    const responses: Response[] = []

    for (const path of ['/empty', '/invalid', '/extra', '/duplicate']) {
      responses.push(await app.request(path, { method: 'POST' }))
    }

    expect(await Promise.all(responses.map((response) => response.text()))).toEqual([
      'empty-ok',
      'invalid-ok',
      'extra-ok',
      'duplicate-ok',
    ])
    expect(events).toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(4)
    expect(logger.warn).toHaveBeenNthCalledWith(
      4,
      {
        operationLogErrorKind: 'duplicate_registration',
        requestId: '10000000-0000-4000-8000-000000000003',
      },
      'operation log registration discarded',
    )
    expect(JSON.stringify((logger.warn as ReturnType<typeof vi.fn>).mock.calls)).not.toMatch(
      /secret|invalid:action|system:user/,
    )
  })

  it('does not enqueue unregistered requests and isolates receiver failures from the response', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    const receiver = vi.fn(() => {
      throw new Error('receiver-secret')
    })
    const app = createTestApp({ events, logger, receiver })
      .get('/unregistered', (c) => c.text('unregistered-ok'))
      .post('/registered', (c) => {
        recordOperation(c, 'system:user:delete', { targetKey: 'user-1' })
        return c.text('registered-ok')
      })

    expect(await (await app.request('/unregistered')).text()).toBe('unregistered-ok')
    expect(await (await app.request('/registered', { method: 'POST' })).text()).toBe(
      'registered-ok',
    )
    expect(receiver).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      {
        operationLogErrorKind: 'finalization_error',
        requestId: '10000000-0000-4000-8000-000000000003',
      },
      'operation log finalization failed',
    )
    expect(JSON.stringify((logger.error as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      'receiver-secret',
    )
  })

  it('isolates invalid finalization durations from the response', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    let monotonicTime = 10
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime)
    const app = createTestApp({ events, logger }).post('/invalid-duration', (c) => {
      recordOperation(c, 'system:user:delete', { targetKey: 'user-1' })
      monotonicTime = 9
      return c.text('business-ok')
    })

    const response = await app.request('/invalid-duration', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('business-ok')
    expect(events).toEqual([])
    expect(logger.error).toHaveBeenCalledWith(
      {
        operationLogErrorKind: 'finalization_error',
        requestId: '10000000-0000-4000-8000-000000000003',
      },
      'operation log finalization failed',
    )
  })
})
