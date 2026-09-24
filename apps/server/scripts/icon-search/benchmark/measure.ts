import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type Sample = {
  phase: string
  kind: string
  query?: string
  elapsedMs: number
  scheduledDelayMs?: number
}

export function emit(value: object) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

export function percentile95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
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
