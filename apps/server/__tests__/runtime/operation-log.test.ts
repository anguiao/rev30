import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import type { Db } from '../../src/db'
import { opsOperationLogs } from '../../src/db/schema'
import { createOperationLogRuntime, type OperationLogEvent } from '../../src/runtime/operation-log'

type OperationLogInsert = typeof opsOperationLogs.$inferInsert

function createEvent(index: number): OperationLogEvent {
  return {
    actorUserId: '10000000-0000-4000-8000-000000000001',
    actorUsername: 'ada',
    actorNickname: 'Ada',
    actorIsAdmin: false,
    actorSessionId: '10000000-0000-4000-8000-000000000002',
    module: 'system',
    action: 'system:user:update',
    targetType: 'user',
    targetKey: String(index),
    targetLabel: null,
    result: 'success',
    httpStatus: 200,
    durationMs: index,
    requestId: `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    clientIp: null,
    clientIpSource: 'unavailable',
    userAgent: null,
    createdAt: '2026-08-19T00:00:00.000Z',
  }
}

function createLoggerSpy() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger
}

function createDatabase(write: (values: OperationLogInsert) => Promise<void>) {
  return {
    insert: vi.fn(() => ({ values: write })),
  } as unknown as Db
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('operation log runtime', () => {
  it('persists one row with the event fields', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    const insert = vi.fn(() => ({ values }))
    const logger = createLoggerSpy()
    const runtime = createOperationLogRuntime({ insert } as unknown as Db, logger)
    const event = createEvent(5)

    runtime.receiver(event)

    await vi.waitFor(() => expect(values).toHaveBeenCalledTimes(1))
    expect(insert).toHaveBeenCalledWith(opsOperationLogs)
    expect(values).toHaveBeenCalledWith({
      ...event,
      createdAt: new Date('2026-08-19T00:00:00.000Z'),
    })
    runtime.stop()
  })

  it('uses capacity 32 including the in-flight item and rejects overflow synchronously', async () => {
    const firstWrite = deferred()
    const writer = vi.fn(async () => firstWrite.promise)
    const logger = createLoggerSpy()
    const runtime = createOperationLogRuntime(createDatabase(writer), logger)

    for (let index = 0; index < 32; index += 1) {
      runtime.receiver(createEvent(index))
    }
    runtime.receiver(createEvent(32))

    expect(writer).toHaveBeenCalledTimes(1)
    expect(writer).toHaveBeenCalledWith({
      ...createEvent(0),
      createdAt: new Date('2026-08-19T00:00:00.000Z'),
    })
    expect(logger.warn).toHaveBeenCalledWith(
      { operationLogErrorKind: 'full' },
      'operation log enqueue failed',
    )

    runtime.stop()
    firstWrite.resolve()
    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(1))
  })

  it('writes strictly in FIFO order with one consumer and continues after one failure', async () => {
    const order: number[] = []
    let active = 0
    let maxActive = 0
    const logger = createLoggerSpy()
    const writer = vi.fn(async (event: OperationLogInsert) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      order.push(event.durationMs)
      await Promise.resolve()
      active -= 1

      if (event.durationMs === 1) {
        throw Object.assign(new Error('postgres://secret-host query secret'), {
          cause: {
            code: '23514',
            constraint_name: 'ops_operation_logs_result_status_check',
            detail: 'password=secret',
            hint: 'query secret',
          },
        })
      }
    })
    const runtime = createOperationLogRuntime(createDatabase(writer), logger)

    runtime.receiver(createEvent(0))
    runtime.receiver(createEvent(1))
    runtime.receiver(createEvent(2))

    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(3))
    expect(order).toEqual([0, 1, 2])
    expect(maxActive).toBe(1)
    expect(logger.error).toHaveBeenCalledTimes(1)
    const [fields, message] = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(message).toBe('operation log persistence failed')
    expect(fields).toMatchObject({
      action: 'system:user:update',
      operationLogErrorKind: 'persistence_failure',
      err: expect.any(Error),
      requestId: '10000000-0000-4000-8000-000000000001',
      status: 200,
    })
    expect((fields as { err: Error }).err.message).toBe('Operation log persistence failed')
    expect(JSON.stringify(fields)).not.toMatch(/secret|query|password|detail|hint|targetKey/)
  })

  it('stops immediately, drops only unstarted events, and rejects later events', async () => {
    const firstWrite = deferred()
    const writer = vi.fn(async () => firstWrite.promise)
    const logger = createLoggerSpy()
    const runtime = createOperationLogRuntime(createDatabase(writer), logger)

    runtime.receiver(createEvent(0))
    runtime.receiver(createEvent(1))
    runtime.receiver(createEvent(2))
    runtime.stop()
    runtime.receiver(createEvent(3))

    expect(writer).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      { operationLogErrorKind: 'stopped', droppedCount: 2 },
      'operation log buffer stopped',
    )
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      { operationLogErrorKind: 'stopped' },
      'operation log enqueue failed',
    )

    firstWrite.resolve()
    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(1))
  })
})
