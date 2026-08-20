import type { OperationLogAction } from '@rev30/contracts'
import { Hono } from 'hono'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { rootErrorHandler } from '../../../../src/app'
import type { AuthVariables } from '../../../../src/middleware/auth'
import type { RequestContextEnv } from '../../../../src/middleware/request-context'
import {
  createOperationAuditMiddleware,
  markOperationAudit,
  type OperationAuditEnv,
} from '../../../../src/modules/ops/operation-logs/audit'
import type {
  OperationAuditEvent,
  OperationAuditSink,
} from '../../../../src/modules/ops/operation-logs/types'

type TestEnv = {
  Variables: RequestContextEnv['Variables'] & AuthVariables & OperationAuditEnv['Variables']
}

function createLoggerSpy() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger
}

function createTestApp(options: {
  events: OperationAuditEvent[]
  logger: Logger
  monotonicNow: () => number
  now?: () => Date
  sink?: OperationAuditSink
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
      createOperationAuditMiddleware({
        logger: options.logger,
        sink: options.sink ?? { enqueue: (event) => options.events.push(event) },
        monotonicNow: options.monotonicNow,
        now: options.now ?? (() => new Date('2026-08-19T00:00:00.000Z')),
      }),
    )
    .onError(rootErrorHandler)

  return app
}

describe('operation audit marker and middleware', () => {
  it('captures a normalized immutable event after the final successful response', async () => {
    const events: OperationAuditEvent[] = []
    const logger = createLoggerSpy()
    let monotonicTime = 10
    const app = createTestApp({ events, logger, monotonicNow: () => monotonicTime }).post(
      '/success',
      (c) => {
        markOperationAudit(c, 'system:user:update', {
          targetKey: `  ${'k'.repeat(600)}  `,
          targetLabel: '  Ada  ',
        })
        monotonicTime = 22.9

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
    expect(Object.isFrozen(events[0])).toBe(true)
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('uses the final 4xx and 500 responses without exposing response bodies', async () => {
    const events: OperationAuditEvent[] = []
    const logger = createLoggerSpy()
    let monotonicTime = 0
    const app = createTestApp({ events, logger, monotonicNow: () => monotonicTime })
      .post('/failure', (c) => {
        markOperationAudit(c, 'system:user:delete', { targetKey: 'user-1' })
        monotonicTime = 5
        return c.json({ password: 'domain-secret' }, 409)
      })
      .post('/unknown', (c) => {
        markOperationAudit(c, 'system:user:delete', { targetKey: 'user-2' })
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

  it('discards missing targets, invalid registrations and duplicate marks without changing responses', async () => {
    const events: OperationAuditEvent[] = []
    const logger = createLoggerSpy()
    const app = createTestApp({ events, logger, monotonicNow: () => 0 })
      .post('/empty', (c) => {
        markOperationAudit(c, 'system:user:update', { targetKey: ' ', targetLabel: '' })
        return c.text('empty-ok')
      })
      .post('/invalid', (c) => {
        markOperationAudit(c, 'invalid:action' as OperationLogAction, {
          targetKey: 'secret-target',
        })
        return c.text('invalid-ok')
      })
      .post('/extra', (c) => {
        markOperationAudit(c, 'system:user:update', {
          targetKey: 'secret-target',
          extra: 'secret-extra',
        } as never)
        return c.text('extra-ok')
      })
      .post('/duplicate', (c) => {
        markOperationAudit(c, 'system:user:update', { targetKey: 'first-secret' })
        markOperationAudit(c, 'system:user:delete', { targetKey: 'second-secret' })
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
        auditErrorKind: 'duplicate_mark',
        requestId: '10000000-0000-4000-8000-000000000003',
      },
      'operation audit registration discarded',
    )
    expect(JSON.stringify((logger.warn as ReturnType<typeof vi.fn>).mock.calls)).not.toMatch(
      /secret|invalid:action|system:user/,
    )
  })

  it('does not enqueue unmarked requests and isolates sink failures from the response', async () => {
    const events: OperationAuditEvent[] = []
    const logger = createLoggerSpy()
    const sink = {
      enqueue: vi.fn(() => {
        throw new Error('sink-secret')
      }),
    }
    const app = createTestApp({ events, logger, monotonicNow: () => 0, sink })
      .get('/unmarked', (c) => c.text('unmarked-ok'))
      .post('/marked', (c) => {
        markOperationAudit(c, 'system:user:delete', { targetKey: 'user-1' })
        return c.text('marked-ok')
      })

    expect(await (await app.request('/unmarked')).text()).toBe('unmarked-ok')
    expect(await (await app.request('/marked', { method: 'POST' })).text()).toBe('marked-ok')
    expect(sink.enqueue).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      {
        auditErrorKind: 'sink_error',
        requestId: '10000000-0000-4000-8000-000000000003',
      },
      'operation audit finalization failed',
    )
    expect(JSON.stringify((logger.error as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      'sink-secret',
    )
  })

  it('isolates diagnostic logger failures from discarded responses', async () => {
    const logger = {
      warn: vi.fn(() => {
        throw new Error('logger-secret')
      }),
    } as unknown as Logger
    const app = createTestApp({ events: [], logger, monotonicNow: () => 0 }).post(
      '/discarded',
      (c) => {
        markOperationAudit(c, 'system:user:update', { targetKey: ' ' })
        return c.text('business-ok')
      },
    )

    const response = await app.request('/discarded', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('business-ok')
  })
})
