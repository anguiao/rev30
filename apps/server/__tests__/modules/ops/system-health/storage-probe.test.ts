import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSystemHealthStorageProbe } from '../../../../src/modules/ops/system-health/storage-probe'

function setup() {
  let elapsed = 100
  let now = new Date('2026-09-01T00:00:00.000Z')
  const storage = { provider: 'local', probe: vi.fn<() => Promise<void>>(async () => undefined) }
  const logger = { error: vi.fn() }
  const probe = createSystemHealthStorageProbe({
    storage,
    logger,
    now: () => now,
    monotonicNow: () => elapsed,
  })
  return {
    storage,
    logger,
    probe,
    advance(milliseconds: number) {
      elapsed += milliseconds
      now = new Date(now.getTime() + milliseconds)
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('system health storage probe', () => {
  it('shares concurrent probes and caches successful results from completion for 30 seconds', async () => {
    const context = setup()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    context.storage.probe.mockReturnValueOnce(pending)
    const first = context.probe()
    const second = context.probe()
    expect(context.storage.probe).toHaveBeenCalledTimes(1)
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
    await expect(context.probe()).resolves.toEqual({ ...expected, cached: true })
    expect(context.storage.probe).toHaveBeenCalledTimes(1)
    context.advance(1)
    await expect(context.probe()).resolves.toMatchObject({ latencyMs: 0, cached: false })
    expect(context.storage.probe).toHaveBeenCalledTimes(2)
    expect(context.logger.error).not.toHaveBeenCalled()
  })

  it('caches failures, logs only the actual probe error and recovers after expiry', async () => {
    const context = setup()
    const error = new Error('private root /secret/storage')
    context.storage.probe.mockRejectedValueOnce(error)
    const result = await context.probe()
    expect(result).toEqual({
      provider: 'local',
      status: 'unavailable',
      latencyMs: null,
      checkedAt: '2026-09-01T00:00:00.000Z',
      cached: false,
    })
    expect(context.logger.error).toHaveBeenCalledExactlyOnceWith(
      { component: 'storage', err: error },
      'system health probe failed',
    )
    context.advance(29_999)
    await expect(context.probe()).resolves.toEqual({ ...result, cached: true })
    expect(context.logger.error).toHaveBeenCalledTimes(1)
    expect(context.storage.probe).toHaveBeenCalledTimes(1)
    context.advance(1)
    await expect(context.probe()).resolves.toMatchObject({ status: 'healthy', cached: false })
  })

  it('isolates returned objects and rounds latency to whole milliseconds', async () => {
    const context = setup()
    context.storage.probe.mockImplementationOnce(async () => context.advance(1.8))
    const result = await context.probe()
    expect(result.latencyMs).toBe(2)
    result.provider = 'tampered'
    const cached = await context.probe()
    expect(cached.provider).toBe('local')
    cached.status = 'unavailable'
    await expect(context.probe()).resolves.toMatchObject({ status: 'healthy' })
  })
})
