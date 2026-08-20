import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanupOperationLogs: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn() },
}))

vi.mock('../../src/modules/ops/operation-logs/cleanup', () => ({
  cleanupOperationLogs: mocks.cleanupOperationLogs,
}))
vi.mock('../../src/runtime/logger', () => ({ logger: mocks.logger }))

import { startOpsOperationLogCleanup } from '../../src/maintenance/ops-operation-log-cleanup'

describe('operation log cleanup maintenance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS', '50')
    vi.stubEnv('OPS_OPERATION_LOG_RETENTION_MS', '70')
    vi.clearAllMocks()
    mocks.cleanupOperationLogs.mockResolvedValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('runs immediately without overlap and stops future runs after awaiting the current run', async () => {
    const resolvers: ((count: number) => void)[] = []
    mocks.cleanupOperationLogs.mockImplementation(
      () => new Promise<number>((resolve) => resolvers.push(resolve)),
    )
    const worker = startOpsOperationLogCleanup({} as never)

    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.cleanupOperationLogs).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(mocks.cleanupOperationLogs).toHaveBeenCalledTimes(1)

    const stopPromise = worker.stop()
    let stopped = false
    void stopPromise.then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    resolvers.shift()?.(0)
    await stopPromise
    expect(stopped).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(mocks.cleanupOperationLogs).toHaveBeenCalledTimes(1)
  })

  it('logs failures, recovers next cycle, and logs success only for positive counts', async () => {
    const error = new Error('database unavailable')
    mocks.cleanupOperationLogs
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(2)
      .mockResolvedValue(0)
    const worker = startOpsOperationLogCleanup({} as never)

    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.logger.error).toHaveBeenCalledWith(
      { err: error },
      'ops operation log cleanup failed',
    )
    await vi.advanceTimersByTimeAsync(50)
    expect(mocks.logger.info).toHaveBeenCalledWith(
      { deletedCount: 2 },
      'ops operation log cleanup completed',
    )
    await vi.advanceTimersByTimeAsync(50)
    expect(mocks.logger.info).toHaveBeenCalledTimes(1)

    await worker.stop()
  })

  it('does not schedule when interval is zero', async () => {
    vi.stubEnv('OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS', '0')
    const disabled = startOpsOperationLogCleanup({} as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.cleanupOperationLogs).not.toHaveBeenCalled()
    await disabled.stop()
  })

  it('uses the default interval and retention', async () => {
    vi.unstubAllEnvs()
    const worker = startOpsOperationLogCleanup({} as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.cleanupOperationLogs).toHaveBeenCalledWith(expect.anything(), 15_552_000_000)
    await vi.advanceTimersByTimeAsync(21_599_999)
    expect(mocks.cleanupOperationLogs).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.cleanupOperationLogs).toHaveBeenCalledTimes(2)
    await worker.stop()
  })

  it('suppresses failure logs when a running cleanup rejects after stop', async () => {
    let rejectRun!: (error: Error) => void
    mocks.cleanupOperationLogs.mockImplementation(
      () => new Promise<number>((_resolve, reject) => (rejectRun = reject)),
    )
    const worker = startOpsOperationLogCleanup({} as never)
    await vi.advanceTimersByTimeAsync(0)

    const stopPromise = worker.stop()
    rejectRun(new Error('late failure'))
    await stopPromise

    expect(mocks.logger.error).not.toHaveBeenCalled()
  })

  it.each(['abc', '-1', '1.5', `${2 ** 31}`, `${Number.MAX_SAFE_INTEGER + 1}`])(
    'rejects invalid interval %s',
    (value) => {
      vi.stubEnv('OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS', value)
      expect(() => startOpsOperationLogCleanup({} as never)).toThrow(
        'OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值',
      )
    },
  )

  it.each(['-1', '1.5', `${Number.MAX_SAFE_INTEGER + 1}`])(
    'rejects invalid retention %s',
    (value) => {
      vi.stubEnv('OPS_OPERATION_LOG_RETENTION_MS', value)
      expect(() => startOpsOperationLogCleanup({} as never)).toThrow(
        'OPS_OPERATION_LOG_RETENTION_MS 必须是 0 或正整数毫秒值',
      )
    },
  )
})
