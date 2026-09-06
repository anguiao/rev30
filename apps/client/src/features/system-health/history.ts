import type { SystemHealthSnapshot } from '@rev30/contracts'

const SLOT_MS = 10_000
const WINDOW_MS = 600_000
const MAX_SAMPLES = WINDOW_MS / SLOT_MS + 1

interface TimedSample {
  at: number
  segment: number
}

interface HealthSample extends TimedSample {
  rssBytes: number
  databaseMs: number | null
}

interface StorageSample extends TimedSample {
  latencyMs: number | null
}

export interface HealthHistory {
  startedAt: string | null
  anchor: number | null
  latestAt: number | null
  storageCheckedAt: string | null
  samples: HealthSample[]
  storage: StorageSample[]
}

export function createHealthHistory(): HealthHistory {
  return {
    startedAt: null,
    anchor: null,
    latestAt: null,
    storageCheckedAt: null,
    samples: [],
    storage: [],
  }
}

export function appendHealthSnapshot(history: HealthHistory, snapshot: SystemHealthSnapshot) {
  if (history.startedAt !== snapshot.instance.startedAt) {
    Object.assign(history, createHealthHistory(), { startedAt: snapshot.instance.startedAt })
  }

  const at = Date.parse(snapshot.observedAt)
  if (history.latestAt !== null && at <= history.latestAt) {
    return
  }

  history.anchor ??= at
  const slot = Math.floor((at - history.anchor) / SLOT_MS)
  const previous = history.samples.at(-1)
  const previousSlot =
    previous === undefined ? null : Math.floor((previous.at - history.anchor) / SLOT_MS)

  let segment = previous?.segment ?? 0
  if (previousSlot !== null && slot - previousSlot > 1) {
    segment += 1
  }

  const sample: HealthSample = {
    at,
    rssBytes: snapshot.instance.memory.rssBytes,
    databaseMs: snapshot.database.latencyMs,
    segment,
  }

  if (slot === previousSlot) {
    history.samples[history.samples.length - 1] = sample
  } else {
    history.samples.push(sample)
  }
  history.latestAt = at

  if (history.storageCheckedAt !== snapshot.storage.checkedAt) {
    history.storage.push({
      at: Date.parse(snapshot.storage.checkedAt),
      latencyMs: snapshot.storage.latencyMs,
      segment,
    })
    history.storageCheckedAt = snapshot.storage.checkedAt
  }

  const windowStart = at - WINDOW_MS
  history.samples = history.samples.filter((point) => point.at >= windowStart).slice(-MAX_SAMPLES)
  history.storage = history.storage.filter((point) => point.at >= windowStart).slice(-MAX_SAMPLES)
}

// Null markers represent known observation gaps, never invented measurements.
export function healthTrendData<T extends TimedSample>(
  samples: T[],
  getValue: (sample: T) => number | null,
) {
  const data: Array<[number, number | null]> = []

  for (const [index, sample] of samples.entries()) {
    const previous = samples[index - 1]

    if (previous !== undefined && sample.segment !== previous.segment) {
      data.push([previous.at + (sample.at - previous.at) / 2, null])
    }

    data.push([sample.at, getValue(sample)])
  }

  return data
}
