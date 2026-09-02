import { describe, expect, it } from 'vitest'
import {
  createHealthHistory,
  appendHealthSnapshot,
  markHealthHistoryGap,
  healthTrendData,
} from '../../../src/features/ops/system-health/history'
import { healthSnapshot } from '../../helpers/system-health'

describe('system health local history', () => {
  it('deduplicates observations and keeps the original slot anchor through replacements and pruning', () => {
    const history = createHealthHistory()
    for (const second of [0, 9, 9, 10, 19, 20])
      appendHealthSnapshot(history, healthSnapshot(second))
    expect(history.samples.map((point) => point.at)).toEqual(
      [9, 19, 20].map((n) => Date.parse(healthSnapshot(n).observedAt)),
    )
    const anchor = history.anchor
    for (let second = 30; second <= 700; second += 10)
      appendHealthSnapshot(history, healthSnapshot(second))
    expect(history.anchor).toBe(anchor)
    expect(history.samples).toHaveLength(61)
    expect(history.samples[0]!.at).toBe(Date.parse(healthSnapshot(100).observedAt))
  })

  it('keeps storage on its own checkedAt clock and retains unavailable values as null', () => {
    const history = createHealthHistory()
    appendHealthSnapshot(history, healthSnapshot())
    const next = healthSnapshot(10)
    next.storage = { ...healthSnapshot().storage, cached: true }
    next.database = { ...next.database, status: 'unavailable', latencyMs: null }
    appendHealthSnapshot(history, next)
    expect(history.storage).toHaveLength(1)
    expect(history.samples[1]!.databaseMs).toBeNull()
    const failed = healthSnapshot(30)
    failed.storage = { ...failed.storage, status: 'unavailable', latencyMs: null }
    appendHealthSnapshot(history, failed)
    expect(history.storage[1]!.latencyMs).toBeNull()
  })

  it('breaks known sampling gaps, including a resumed sample in the same slot, and resets on restart', () => {
    const history = createHealthHistory()
    appendHealthSnapshot(history, healthSnapshot())
    appendHealthSnapshot(history, healthSnapshot(10))
    markHealthHistoryGap(history)
    appendHealthSnapshot(history, healthSnapshot(15))
    expect(healthTrendData(history.samples, 'rssBytes').some((point) => point[1] === null)).toBe(
      true,
    )
    const restarted = healthSnapshot(20)
    restarted.instance.startedAt = '2026-09-01T04:00:19.000Z'
    appendHealthSnapshot(history, restarted)
    expect(history.samples).toHaveLength(1)
    expect(history.storage).toHaveLength(1)
    expect(history.anchor).toBe(Date.parse(restarted.observedAt))
  })
  it('retains a storage gap through cached snapshots and clips storage against the newest observation', () => {
    const history = createHealthHistory()
    appendHealthSnapshot(history, healthSnapshot())
    markHealthHistoryGap(history)
    const cached = healthSnapshot(10)
    cached.storage = { ...healthSnapshot().storage, cached: true }
    appendHealthSnapshot(history, cached)
    expect(history.storageGap).toBe(true)
    appendHealthSnapshot(history, healthSnapshot(30))
    expect(healthTrendData(history.storage, 'latencyMs')).toEqual([
      [Date.parse(healthSnapshot().observedAt), 5],
      [Date.parse(healthSnapshot(15).observedAt), null],
      [Date.parse(healthSnapshot(30).observedAt), 5],
    ])
    const later = healthSnapshot(631)
    later.storage = { ...healthSnapshot(30).storage, cached: true }
    appendHealthSnapshot(history, later)
    expect(history.storage).toEqual([])
  })

  it('breaks missing time slots without inventing zero-valued samples', () => {
    const history = createHealthHistory()
    appendHealthSnapshot(history, healthSnapshot())
    appendHealthSnapshot(history, healthSnapshot(30))
    expect(history.samples).toHaveLength(2)
    expect(healthTrendData(history.samples, 'databaseMs').map((point) => point[1])).toEqual([
      3,
      null,
      3,
    ])
  })
})
