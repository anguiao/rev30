import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createOperationAuditBuffer } from '../../../../src/modules/ops/operation-logs/buffer'
import type { OperationAuditEvent } from '../../../../src/modules/ops/operation-logs/types'

function createEvent(index: number): OperationAuditEvent {
  return Object.freeze({
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
  })
}

function createLoggerSpy() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('operation audit buffer', () => {
  it('uses capacity 32 including the in-flight item and rejects overflow synchronously', async () => {
    const firstWrite = deferred()
    const writer = vi.fn(async () => firstWrite.promise)
    const logger = createLoggerSpy()
    const buffer = createOperationAuditBuffer({ logger, writer })

    for (let index = 0; index < 32; index += 1) {
      buffer.enqueue(createEvent(index))
    }
    buffer.enqueue(createEvent(32))

    expect(writer).toHaveBeenCalledTimes(1)
    expect(writer).toHaveBeenCalledWith(createEvent(0))
    expect(logger.warn).toHaveBeenCalledWith(
      { auditErrorKind: 'full' },
      'operation audit enqueue failed',
    )

    buffer.stop()
    firstWrite.resolve()
    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(1))
  })

  it('writes strictly in FIFO order with one consumer and continues after one failure', async () => {
    const order: number[] = []
    let active = 0
    let maxActive = 0
    const logger = createLoggerSpy()
    const writer = vi.fn(async (event: OperationAuditEvent) => {
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
    const buffer = createOperationAuditBuffer({ logger, writer })

    buffer.enqueue(createEvent(0))
    buffer.enqueue(createEvent(1))
    buffer.enqueue(createEvent(2))

    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(3))
    expect(order).toEqual([0, 1, 2])
    expect(maxActive).toBe(1)
    expect(logger.error).toHaveBeenCalledTimes(1)
    const [fields, message] = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(message).toBe('operation audit persistence failed')
    expect(fields).toMatchObject({
      action: 'system:user:update',
      auditErrorKind: 'constraint_violation',
      constraint: 'ops_operation_logs_result_status_check',
      err: expect.any(Error),
      postgresCode: '23514',
      status: 200,
    })
    expect((fields as { err: Error }).err.message).toBe('Operation audit persistence failed')
    expect(JSON.stringify(fields)).not.toMatch(/secret|query|password|detail|hint|targetKey/)
  })

  it('stops immediately, drops only unstarted events, and rejects later enqueue calls', async () => {
    const firstWrite = deferred()
    const writer = vi.fn(async () => firstWrite.promise)
    const logger = createLoggerSpy()
    const buffer = createOperationAuditBuffer({ logger, writer })

    buffer.enqueue(createEvent(0))
    buffer.enqueue(createEvent(1))
    buffer.enqueue(createEvent(2))
    buffer.stop()
    buffer.enqueue(createEvent(3))

    expect(writer).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      { auditErrorKind: 'stopped', droppedCount: 2 },
      'operation audit buffer stopped',
    )
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      { auditErrorKind: 'stopped' },
      'operation audit enqueue failed',
    )

    firstWrite.resolve()
    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(1))
  })

  it('continues consuming and keeps enqueue and stop synchronous when diagnostic logging throws', async () => {
    const logger = {
      error: vi.fn(() => {
        throw new Error('error-logger-secret')
      }),
      warn: vi.fn(() => {
        throw new Error('warn-logger-secret')
      }),
    } as unknown as Logger
    const writer = vi
      .fn<(event: OperationAuditEvent) => Promise<void>>()
      .mockRejectedValueOnce(new Error('writer-secret'))
      .mockResolvedValue(undefined)
    const buffer = createOperationAuditBuffer({ logger, writer })

    buffer.enqueue(createEvent(0))
    buffer.enqueue(createEvent(1))

    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(2))

    const blockedWrite = deferred()
    const fullBuffer = createOperationAuditBuffer({
      logger,
      writer: async () => blockedWrite.promise,
    })
    for (let index = 0; index < 32; index += 1) {
      fullBuffer.enqueue(createEvent(index))
    }

    expect(() => fullBuffer.enqueue(createEvent(32))).not.toThrow()
    expect(() => fullBuffer.stop()).not.toThrow()
    expect(() => fullBuffer.enqueue(createEvent(33))).not.toThrow()
    blockedWrite.resolve()
  })
})
