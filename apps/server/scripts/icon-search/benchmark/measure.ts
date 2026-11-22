import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type Sample = {
  phase: string
  kind: string
  query?: string
  elapsedMs: number
  scheduledDelayMs?: number
}

export type QueryLatency = {
  kind: string
  query: string
  page?: number
  p95Ms: number
}

export type BurstLatency = {
  batchP95Ms: number
  requestP95Ms: number
}

export const searchP95LimitMs = 50
export const burstP95LimitMs = 200

export function emit(value: object) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

export function percentile95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
}

export function assertLatencyTargets(queries: readonly QueryLatency[], burst: BurstLatency) {
  const failures = queries
    .filter(({ p95Ms }) => p95Ms > searchP95LimitMs)
    .map(({ kind, query, page, p95Ms }) => {
      const location = page ? ` (page ${page})` : ''
      return `${kind} ${JSON.stringify(query)}${location} P95 ${p95Ms.toFixed(3)} ms exceeds ${searchP95LimitMs} ms`
    })
  if (burst.batchP95Ms > burstP95LimitMs) {
    failures.push(
      `10-request burst P95 ${burst.batchP95Ms.toFixed(3)} ms exceeds ${burstP95LimitMs} ms`,
    )
  }
  if (failures.length) throw new Error(failures.join('\n'))
}

export async function directorySize(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true })
  let total = 0
  for (const entry of entries) {
    const entryPath = join(path, entry.name)
    total += entry.isDirectory() ? await directorySize(entryPath) : (await stat(entryPath)).size
  }
  return total
}

export async function measure(input: Omit<Sample, 'elapsedMs'>, operation: () => Promise<unknown>) {
  const startedAt = performance.now()
  await operation()
  const sample = { ...input, elapsedMs: performance.now() - startedAt }
  emit({ type: 'sample', ...sample })
  return sample
}
