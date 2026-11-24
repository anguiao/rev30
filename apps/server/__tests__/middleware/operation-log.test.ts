import { zValidator } from '@hono/zod-validator'
import { Hono, type MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { rootErrorHandler } from '../../src/app'
import type { AuthEnv } from '../../src/middleware/auth'
import { createRequestLogger } from '../../src/middleware/logger'
import {
  createOperationLogMiddleware,
  operationLog,
  type OperationLogEnv,
  type OperationLogInput,
} from '../../src/middleware/operation-log'
import type { RequestContextEnv } from '../../src/middleware/request-context'
import type { OperationLogEvent, OperationLogEventReceiver } from '../../src/runtime/operation-log'
import { createLogger } from '../../src/runtime/logger'

type TestEnv = AuthEnv & RequestContextEnv & OperationLogEnv
const targetParamValidator = zValidator('param', z.object({ id: z.string().trim().min(1) }))
type TargetParamInput = OperationLogInput<typeof targetParamValidator>

function createLoggerSpy() {
  const logger = createLogger({ level: 'silent' })
  vi.spyOn(logger, 'error')
  vi.spyOn(logger, 'warn')
  return logger
}

function createTestApp(options: {
  events: OperationLogEvent[]
  logger: Logger
  receiver?: OperationLogEventReceiver
}) {
  const app = new Hono<TestEnv>()
    .use('*', async (c, next) => {
      const requestBindings = {
        requestId: '10000000-0000-4000-8000-000000000003',
        clientIp: '192.0.2.1',
        clientIpSource: 'x-forwarded-for',
      } as const

      c.set('requestContext', {
        ...requestBindings,
        userAgent: 'Example/1.0',
        logger: options.logger.child({
          ...requestBindings,
          method: c.req.method,
          path: c.req.path,
        }),
      })
      c.header('X-Request-Id', requestBindings.requestId)
      c.set('currentUser', {
        id: '10000000-0000-4000-8000-000000000001',
        username: 'a'.repeat(600),
        nickname: 'n'.repeat(600),
        avatarId: null,
        email: null,
        phone: null,
        status: 1,
        builtIn: false,
        departments: [],
        roles: [],
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:00:00.000Z',
      })
      c.set('currentSessionId', '10000000-0000-4000-8000-000000000002')
      c.set('accessCodes', [])
      c.set('menus', [])
      c.set('isAdmin', true)
      await next()
    })
    .use('*', createRequestLogger())
    .use(
      '*',
      createOperationLogMiddleware({
        receiver: options.receiver ?? ((event) => options.events.push(event)),
        logger: options.logger,
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
    const target = {
      targetKey: `  ${'k'.repeat(600)}  `,
      targetLabel: '  Ada  ',
    }
    const app = createTestApp({ events, logger }).post(
      '/success',
      operationLog('system:user:update', () => target),
      (c) => {
        monotonicTime = 22.9
        target.targetLabel = 'Changed by handler'

        return c.json({ secret: 'response-secret' })
      },
    )

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
    const app = createTestApp({ events, logger }).post(
      '/unicode',
      operationLog('system:user:update', () => ({
        targetKey: unicodeValue,
        targetLabel: multilineValue,
      })),
      (c) => c.json({ ok: true }),
    )

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

  it('records the target fields supplied by the route for any action', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    const app = createTestApp({ events, logger })
      .get('/detail', operationLog('system:user:view'), (c) => c.body(null, 204))
      .get(
        '/list',
        operationLog('system:user:list', () => ({ targetKey: 'group-1', targetLabel: ' ' })),
        (c) => c.body(null, 204),
      )

    expect((await app.request('/detail')).status).toBe(204)
    expect((await app.request('/list')).status).toBe(204)

    expect(events).toMatchObject([
      { action: 'system:user:view', targetKey: null, targetLabel: null },
      { action: 'system:user:list', targetKey: 'group-1', targetLabel: null },
    ])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('selects actions and targets from validated path and body values', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    const enabledBodyValidator = zValidator(
      'json',
      z.object({ enabled: z.enum(['on', 'off']).transform((status) => status === 'on') }),
    )
    const selectAction = vi.fn((enabled: boolean) =>
      enabled ? 'ops:scheduled-job:enable' : 'ops:scheduled-job:disable',
    )
    const app = createTestApp({ events, logger }).patch(
      '/jobs/:id',
      targetParamValidator,
      enabledBodyValidator,
      operationLog<TargetParamInput & OperationLogInput<typeof enabledBodyValidator>>(
        (request) => selectAction(request.valid('json').enabled),
        (request) => ({ targetKey: `job:${request.valid('param').id}` }),
      ),
      (c) => c.json({ id: c.req.valid('param').id, enabled: c.req.valid('json').enabled }),
    )

    for (const [value, status, expected] of [
      ['on', 200, { id: 'cleanup', enabled: true }],
      ['off', 200, { id: 'cleanup', enabled: false }],
      ['invalid', 400, undefined],
    ] as const) {
      const response = await app.request('/jobs/%20cleanup%20', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: value }),
      })

      expect(response.status).toBe(status)
      if (expected) {
        expect(await response.json()).toEqual(expected)
      }
    }

    expect(selectAction.mock.calls).toEqual([[true], [false]])
    expect(events).toEqual([
      expect.objectContaining({ action: 'ops:scheduled-job:enable', targetKey: 'job:cleanup' }),
      expect.objectContaining({ action: 'ops:scheduled-job:disable', targetKey: 'job:cleanup' }),
    ])
  })

  it('uses the final 4xx and 500 responses without exposing response bodies', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    let monotonicTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime)
    const app = createTestApp({ events, logger })
      .post(
        '/failure',
        operationLog('system:user:delete', () => ({ targetKey: 'user-1' })),
        (c) => {
          monotonicTime = 5
          return c.json({ password: 'domain-secret' }, 409)
        },
      )
      .post(
        '/unknown',
        operationLog('system:user:delete', () => ({ targetKey: 'user-2' })),
        () => {
          monotonicTime = 9
          throw new Error('database-password-secret')
        },
      )

    const failureResponse = await app.request('/failure', { method: 'POST' })
    const unknownResponse = await app.request('/unknown', { method: 'POST' })

    expect(failureResponse.status).toBe(409)
    expect(unknownResponse.status).toBe(500)
    expect(await failureResponse.json()).toEqual({ password: 'domain-secret' })
    expect(await unknownResponse.text()).toBe('Internal Server Error')
    expect(
      events.map(({ result, httpStatus, durationMs }) => ({ result, httpStatus, durationMs })),
    ).toEqual([
      { result: 'failure', httpStatus: 409, durationMs: 5 },
      { result: 'failure', httpStatus: 500, durationMs: 4 },
    ])
    expect(JSON.stringify(events)).not.toContain('domain-secret')
    expect(JSON.stringify(events)).not.toContain('database-password-secret')
  })

  it('discards invalid and duplicate registrations while executing business handlers once', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    const business = vi.fn((path: string) => path)
    const secondTarget = vi.fn(() => ({ targetKey: 'second-secret' }))
    const app = createTestApp({ events, logger })
      .post(
        '/invalid-action',
        // @ts-expect-error Unknown actions must also be rejected at runtime.
        operationLog('invalid:action', () => ({ targetKey: 'secret' })),
        (c) => c.text(business(c.req.path)),
      )
      .post(
        '/extra',
        operationLog('system:user:update', () => ({ targetKey: 'secret', extra: 'secret-extra' })),
        (c) => c.text(business(c.req.path)),
      )
      .post(
        '/action-error',
        operationLog(() => {
          throw new Error('action-secret')
        }),
        (c) => c.text(business(c.req.path)),
      )
      .post(
        '/target-error',
        operationLog('system:user:update', () => {
          throw new Error('target-secret')
        }),
        (c) => c.text(business(c.req.path)),
      )
      .post(
        '/duplicate',
        operationLog('system:user:update', () => ({ targetKey: 'first-secret' })),
        operationLog('system:user:delete', secondTarget),
        (c) => c.text(business(c.req.path)),
      )

    const paths = ['/invalid-action', '/extra', '/action-error', '/target-error', '/duplicate']
    for (const path of paths) {
      const response = await app.request(path, { method: 'POST' })

      expect(response.status).toBe(200)
      expect(await response.text()).toBe(path)
    }

    expect(business.mock.calls).toEqual(paths.map((path) => [path]))
    expect(secondTarget).not.toHaveBeenCalled()
    expect(events).toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(paths.length)
    expect(logger.warn).toHaveBeenNthCalledWith(
      paths.length,
      {
        operationLogErrorKind: 'duplicate_registration',
        requestId: '10000000-0000-4000-8000-000000000003',
      },
      'operation log registration discarded',
    )
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toMatch(
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
      .post(
        '/registered',
        operationLog('system:user:delete', () => ({ targetKey: 'user-1' })),
        (c) => c.text('registered-ok'),
      )

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
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('receiver-secret')
  })

  it('isolates invalid finalization durations from the response', async () => {
    const events: OperationLogEvent[] = []
    const logger = createLoggerSpy()
    let monotonicTime = 10
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime)
    const app = createTestApp({ events, logger }).post(
      '/invalid-duration',
      operationLog('system:user:delete', () => ({ targetKey: 'user-1' })),
      (c) => {
        monotonicTime = 9
        return c.text('business-ok')
      },
    )

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

  it.each([
    { kind: 'invalid_registration', msg: 'operation log registration discarded' },
    { kind: 'duplicate_registration', msg: 'operation log registration discarded' },
    { kind: 'finalization_error', msg: 'operation log finalization failed' },
  ])('serializes $kind with only the error kind and request ID', async ({ kind, msg }) => {
    const records: Record<string, unknown>[] = []
    const logger = createLogger({
      level: 'info',
      destination: {
        write(line) {
          records.push(JSON.parse(line) as Record<string, unknown>)
        },
      },
    })
    const receiver = vi.fn<OperationLogEventReceiver>(() => {
      throw new Error('receiver-secret')
    })
    const continueRequest: MiddlewareHandler<TestEnv> = async (_c, next) => next()
    const registerAgain =
      kind === 'duplicate_registration'
        ? operationLog('system:user:delete', () => ({ targetKey: 'duplicate-secret' }))
        : continueRequest
    const app = createTestApp({ events: [], logger, receiver }).post(
      '/users/:id',
      targetParamValidator,
      operationLog<TargetParamInput>('system:user:delete', (request) => {
        if (kind === 'invalid_registration') {
          throw new Error('target-resolver-secret')
        }

        return { targetKey: request.valid('param').id }
      }),
      registerAgain,
      (c) => c.text('business-ok', 202),
    )
    const path = '/users/target-1'
    const response = await app.request(path, { method: 'POST' })
    const requestId = response.headers.get('x-request-id')
    const pinoFields = new Set(['level', 'time', 'pid', 'hostname', 'name', 'msg'])
    const diagnosticFields = records
      .filter((record) => record.msg === msg)
      .map((record) =>
        Object.fromEntries(Object.entries(record).filter(([key]) => !pinoFields.has(key))),
      )

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('business-ok')
    expect(requestId).toEqual(expect.any(String))
    expect(receiver).toHaveBeenCalledTimes(kind === 'finalization_error' ? 1 : 0)
    expect(diagnosticFields).toEqual([{ operationLogErrorKind: kind, requestId }])
    expect(records).toContainEqual(
      expect.objectContaining({
        msg: 'request completed',
        requestId,
        method: 'POST',
        path,
        clientIp: '192.0.2.1',
        clientIpSource: 'x-forwarded-for',
        status: 202,
      }),
    )
  })
})
