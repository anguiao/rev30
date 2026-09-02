import type { SystemHealthSnapshot } from '@rev30/contracts'

const SLOT_MS = 10_000
const WINDOW_MS = 600_000
interface TimedSample {
  at: number
  breakBefore: boolean
}
export interface HealthSample extends TimedSample {
  rssBytes: number
  databaseMs: number | null
}
export interface StorageSample extends TimedSample {
  latencyMs: number | null
}
export interface HealthHistory {
  startedAt: string | null
  anchor: number | null
  latestAt: number | null
  storageCheckedAt: string | null
  sampleGap: boolean
  storageGap: boolean
  samples: HealthSample[]
  storage: StorageSample[]
}

export function createHealthHistory(): HealthHistory {
  return {
    startedAt: null,
    anchor: null,
    latestAt: null,
    storageCheckedAt: null,
    sampleGap: false,
    storageGap: false,
    samples: [],
    storage: [],
  }
}

export function markHealthHistoryGap(history: HealthHistory) {
  history.sampleGap = true
  history.storageGap = true
}

export function appendHealthSnapshot(history: HealthHistory, snapshot: SystemHealthSnapshot) {
  if (history.startedAt !== snapshot.instance.startedAt) {
    Object.assign(history, createHealthHistory(), { startedAt: snapshot.instance.startedAt })
  }
  const at = Date.parse(snapshot.observedAt)
  if (history.latestAt !== null && at <= history.latestAt) return
  history.anchor ??= at
  const previous = history.samples.at(-1)
  const sameSlot =
    previous !== undefined &&
    Math.floor((previous.at - history.anchor) / SLOT_MS) ===
      Math.floor((at - history.anchor) / SLOT_MS)
  const sample: HealthSample = {
    at,
    rssBytes: snapshot.instance.memory.rssBytes,
    databaseMs: snapshot.database.latencyMs,
    breakBefore:
      history.sampleGap ||
      (previous !== undefined &&
        Math.floor((at - history.anchor) / SLOT_MS) -
          Math.floor((previous.at - history.anchor) / SLOT_MS) >
          1),
  }
  if (sameSlot) {
    sample.breakBefore ||= previous.breakBefore
    history.samples[history.samples.length - 1] = sample
  } else history.samples.push(sample)
  history.sampleGap = false
  history.latestAt = at
  if (history.storageCheckedAt !== snapshot.storage.checkedAt) {
    history.storage.push({
      at: Date.parse(snapshot.storage.checkedAt),
      latencyMs: snapshot.storage.latencyMs,
      breakBefore: history.storageGap,
    })
    history.storageCheckedAt = snapshot.storage.checkedAt
    history.storageGap = false
  }
  history.samples = history.samples.filter((point) => point.at >= at - WINDOW_MS).slice(-61)
  history.storage = history.storage.filter((point) => point.at >= at - WINDOW_MS).slice(-61)
}

// Null markers represent known observation gaps, never invented measurements.
export function healthTrendData<T extends TimedSample>(
  samples: T[],
  field: { [K in keyof T]: T[K] extends number | null ? K : never }[keyof T],
): Array<[number, number | null]> {
  return samples.flatMap((sample, index) => {
    const point: [number, number | null] = [sample.at, sample[field] as number | null]
    const previous = samples[index - 1]
    return sample.breakBefore && previous !== undefined
      ? [[previous.at + (sample.at - previous.at) / 2, null] as [number, null], point]
      : [point]
  })
}
