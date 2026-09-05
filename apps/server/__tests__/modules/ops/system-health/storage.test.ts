import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorageHealthCheck } from '../../../../src/modules/ops/system-health/storage'

function setup() {
  let elapsed = 100
  let now = new Date('2026-09-01T00:00:00.000Z')
  const storage = {
    provider: 'local',
    checkHealth: vi.fn<() => Promise<void>>(async () => undefined),
  }
  const logger = { error: vi.fn() }
  const checkStorageHealth = createStorageHealthCheck({
    storage,
    now: () => now,
    monotonicNow: () => elapsed,
  })
  return {
    storage,
    logger,
    checkStorageHealth,
    advance(milliseconds: number) {
      elapsed += milliseconds
      now = new Date(now.getTime() + milliseconds)
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('system health storage checks', () => {
  it('shares concurrent health checks and caches successful results from completion for 30 seconds', async () => {
    const context = setup()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    context.storage.checkHealth.mockReturnValueOnce(pending)
    const first = context.checkStorageHealth(context.logger)
    const second = context.checkStorageHealth(context.logger)
    expect(context.storage.checkHealth).toHaveBeenCalledTimes(1)
    context.advance(40_000)
    finish()
    const expected = {
      provider: 'local',
      status: 'healthy',
      latencyMs: 40_000,
      checkedAt: '2026-09-01T00:00:40.000Z',
      cached: false,
    }
    await expect(first).resolves.toEqual(expected)
    await expect(second).resolves.toEqual(expected)
    context.advance(29_999)
    await expect(context.checkStorageHealth(context.logger)).resolves.toEqual({
      ...expected,
      cached: true,
    })
    expect(context.storage.checkHealth).toHaveBeenCalledTimes(1)
    context.advance(1)
    await expect(context.checkStorageHealth(context.logger)).resolves.toMatchObject({
      latencyMs: 0,
      cached: false,
    })
    expect(context.storage.checkHealth).toHaveBeenCalledTimes(2)
    expect(context.logger.error).not.toHaveBeenCalled()
  })

  it('caches failures, logs only the actual health check error and recovers after expiry', async () => {
    const context = setup()
    const nextLogger = { error: vi.fn() }
    const error = new Error('private root /secret/storage')
    context.storage.checkHealth.mockRejectedValueOnce(error)
    const first = context.checkStorageHealth(context.logger)
    const concurrent = context.checkStorageHealth(nextLogger)
    const result = await first
    await expect(concurrent).resolves.toEqual(result)
    expect(result).toEqual({
      provider: 'local',
      status: 'unavailable',
      latencyMs: null,
      checkedAt: '2026-09-01T00:00:00.000Z',
      cached: false,
    })
    expect(context.logger.error).toHaveBeenCalledExactlyOnceWith(
      { component: 'storage', err: error },
      'system health check failed',
    )
    context.advance(29_999)
    await expect(context.checkStorageHealth(nextLogger)).resolves.toEqual({
      ...result,
      cached: true,
    })
    expect(context.logger.error).toHaveBeenCalledTimes(1)
    expect(nextLogger.error).not.toHaveBeenCalled()
    expect(context.storage.checkHealth).toHaveBeenCalledTimes(1)
    context.advance(1)
    context.storage.checkHealth.mockRejectedValueOnce(error)
    await expect(context.checkStorageHealth(nextLogger)).resolves.toMatchObject({
      status: 'unavailable',
      cached: false,
    })
    expect(nextLogger.error).toHaveBeenCalledExactlyOnceWith(
      { component: 'storage', err: error },
      'system health check failed',
    )
    expect(context.logger.error).toHaveBeenCalledTimes(1)
    context.advance(30_000)
    await expect(context.checkStorageHealth(context.logger)).resolves.toMatchObject({
      status: 'healthy',
      cached: false,
    })
  })

  it('isolates returned objects and rounds latency to whole milliseconds', async () => {
    const context = setup()
    context.storage.checkHealth.mockImplementationOnce(async () => context.advance(1.8))
    const result = await context.checkStorageHealth(context.logger)
    expect(result.latencyMs).toBe(2)
    result.provider = 'tampered'
    const cached = await context.checkStorageHealth(context.logger)
    expect(cached.provider).toBe('local')
    cached.status = 'unavailable'
    await expect(context.checkStorageHealth(context.logger)).resolves.toMatchObject({
      status: 'healthy',
    })
  })
})
