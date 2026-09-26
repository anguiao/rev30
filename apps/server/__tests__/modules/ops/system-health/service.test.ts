import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { systemHealthSnapshotSchema } from '@rev30/contracts'
import { createHealthTestContext, observedAt } from './helpers'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(observedAt)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('system health snapshot service', () => {
  it('captures one statistics time without probing current health and propagates database errors', async () => {
    const context = createHealthTestContext()
    expect((await context.service.jobStatistics()).generatedAt).toBe(observedAt.toISOString())
    expect(context.repository.readJobStatistics).toHaveBeenCalledExactlyOnceWith(observedAt)
    expect(context.repository.readSnapshot).not.toHaveBeenCalled()
    expect(context.checkStorageHealth).not.toHaveBeenCalled()
    expect(context.diagnostics).not.toHaveBeenCalled()
    const error = new Error('private statistics query')
    context.repository.readJobStatistics.mockRejectedValueOnce(error)
    await expect(context.service.jobStatistics()).rejects.toBe(error)
    expect(context.logger.error).not.toHaveBeenCalled()
  })

  it('captures the safe current instance and fixes its start time across wall clock changes', async () => {
    const uptime = vi.spyOn(process, 'uptime').mockReturnValue(12.9)
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 5000,
      heapUsed: 2000,
      heapTotal: 4000,
      external: 100,
      arrayBuffers: 50,
    })
    const context = createHealthTestContext()
    const snapshot = await context.service.snapshot(context.logger)
    expect(systemHealthSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(snapshot.instance).toEqual({
      startedAt: '2026-09-01T23:59:47.100Z',
      uptimeSeconds: 12,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: { rssBytes: 5000, heapUsedBytes: 2000, heapTotalBytes: 4000, externalBytes: 100 },
    })
    expect(context.repository.readSnapshot).toHaveBeenCalledExactlyOnceWith(observedAt)
    expect(context.diagnostics.mock.invocationCallOrder[0]).toBeLessThan(
      context.repository.readSnapshot.mock.invocationCallOrder[0]!,
    )
    expect(snapshot).toMatchObject({
      observedAt: observedAt.toISOString(),
      status: 'healthy',
      issues: [],
      scheduler: { shared: { runningCount: 2, overdueCount: 0, oldestOverdueAt: null } },
    })
    vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z'))
    uptime.mockReturnValue(20.2)
    const later = await context.service.snapshot(context.logger)
    expect(later.instance.startedAt).toBe(snapshot.instance.startedAt)
    expect(later.instance.uptimeSeconds).toBe(20)
  })

  it('orders simultaneous issues once and uses database failure as the strongest status', async () => {
    const context = createHealthTestContext()
    context.diagnostics.mockReturnValue({
      ...context.scheduler,
      runtimeStatus: 'stopped',
      retryPending: true,
      lastPollStatus: 'failure',
    })
    context.checkStorageHealth.mockResolvedValue({
      status: 'unavailable',
      provider: 'local',
      latencyMs: null,
      checkedAt: observedAt.toISOString(),
      cached: true,
    })
    context.databaseResult.overdueCount = 3
    context.databaseResult.oldestOverdueAt = new Date(observedAt.getTime() - 100_000)
    const degraded = await context.service.snapshot(context.logger)
    expect(degraded.status).toBe('degraded')
    expect(degraded.issues).toEqual([
      'storage_unavailable',
      'scheduler_stopped',
      'scheduler_query_retry',
      'scheduler_overdue',
    ])
    const error = new Error('private database connection')
    context.repository.readSnapshot.mockRejectedValueOnce(error)
    const unavailable = await context.service.snapshot(context.logger)
    expect(unavailable.status).toBe('unhealthy')
    expect(unavailable.issues).toEqual([
      'database_unavailable',
      'storage_unavailable',
      'scheduler_stopped',
      'scheduler_query_retry',
    ])
    expect(unavailable.database).toEqual({
      status: 'unavailable',
      latencyMs: null,
      checkedAt: observedAt.toISOString(),
    })
    expect(unavailable.scheduler.shared).toEqual({
      runningCount: null,
      overdueCount: null,
      oldestOverdueAt: null,
    })
    expect(context.logger.error).toHaveBeenCalledExactlyOnceWith(
      { component: 'database', err: error },
      'system health check failed',
    )
  })

  it.each([
    { condition: 'stopped', issue: 'scheduler_stopped' },
    { condition: 'retry', issue: 'scheduler_query_retry' },
    { condition: 'poll-failure', issue: 'scheduler_query_retry' },
    { condition: 'overdue', issue: 'scheduler_overdue' },
  ] as const)('degrades for $condition independently', async ({ condition, issue }) => {
    const context = createHealthTestContext()
    if (condition === 'stopped')
      context.diagnostics.mockReturnValue({ ...context.scheduler, runtimeStatus: 'stopped' })
    if (condition === 'retry') context.scheduler.retryPending = true
    if (condition === 'poll-failure') context.scheduler.lastPollStatus = 'failure'
    if (condition === 'overdue') context.databaseResult.overdueCount = 1
    const snapshot = await context.service.snapshot(context.logger)
    expect(snapshot.status).toBe('degraded')
    expect(snapshot.issues).toEqual([issue])
  })

  it('keeps normal capacity, initial poll and memory values healthy', async () => {
    const context = createHealthTestContext()
    context.scheduler.automaticRunning = context.scheduler.automaticCapacity
    context.scheduler.lastPollAt = null
    context.scheduler.lastPollStatus = null
    context.scheduler.nextWakeAt = null
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: Number.MAX_SAFE_INTEGER,
      heapUsed: 10,
      heapTotal: 20,
      external: 30,
      arrayBuffers: 1,
    })
    expect(await context.service.snapshot(context.logger)).toMatchObject({
      status: 'healthy',
      issues: [],
    })
  })

  it('runs independent dependency work concurrently while preserving the observation instant', async () => {
    const context = createHealthTestContext()
    let finish!: (value: typeof context.databaseResult) => void
    context.repository.readSnapshot.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const pending = context.service.snapshot(context.logger)
    expect(context.checkStorageHealth).toHaveBeenCalledExactlyOnceWith(context.logger)
    vi.setSystemTime(new Date(observedAt.getTime() + 5_000))
    finish(context.databaseResult)
    expect((await pending).observedAt).toBe(observedAt.toISOString())
  })

  it('propagates unknown diagnostics, process and storage coordinator errors', async () => {
    const context = createHealthTestContext()
    const error = new Error('unexpected invariant')
    context.diagnostics.mockImplementationOnce(() => {
      throw error
    })
    await expect(context.service.snapshot(context.logger)).rejects.toBe(error)
    expect(context.repository.readSnapshot).not.toHaveBeenCalled()
    vi.spyOn(process, 'memoryUsage').mockImplementationOnce(() => {
      throw error
    })
    await expect(context.service.snapshot(context.logger)).rejects.toBe(error)
    context.checkStorageHealth.mockRejectedValueOnce(error)
    await expect(context.service.snapshot(context.logger)).rejects.toBe(error)
    expect(context.logger.error).not.toHaveBeenCalled()
  })
})
