import type { Logger } from 'pino'
import type { SystemHealthSnapshot } from '@rev30/contracts'
import type { AttachmentStorage } from '../../attachments/storage'

const STORAGE_PROBE_CACHE_MS = 30_000

type StorageProbeResult = SystemHealthSnapshot['storage']

export function createSystemHealthStorageProbe(options: {
  storage: Pick<AttachmentStorage, 'provider' | 'probe'>
  logger: Pick<Logger, 'error'>
  now?: () => Date
  monotonicNow?: () => number
}) {
  const { storage, logger } = options
  const now = options.now ?? (() => new Date())
  const monotonicNow = options.monotonicNow ?? (() => performance.now())
  let completed: { result: StorageProbeResult; completedAt: number } | undefined
  let pending: Promise<StorageProbeResult> | undefined

  async function run(): Promise<StorageProbeResult> {
    const startedAt = monotonicNow()
    let status: StorageProbeResult['status'] = 'healthy'
    try {
      await storage.probe()
    } catch (err) {
      status = 'unavailable'
      logger.error({ component: 'storage', err }, 'system health probe failed')
    }
    const completedAt = monotonicNow()
    const result: StorageProbeResult = {
      provider: storage.provider,
      status,
      latencyMs: status === 'healthy' ? Math.round(completedAt - startedAt) : null,
      checkedAt: now().toISOString(),
      cached: false,
    }
    completed = { result, completedAt }
    return result
  }

  return async (): Promise<StorageProbeResult> => {
    if (completed && monotonicNow() - completed.completedAt < STORAGE_PROBE_CACHE_MS) {
      return { ...completed.result, cached: true }
    }
    pending ??= run().finally(() => {
      pending = undefined
    })
    return { ...(await pending) }
  }
}
