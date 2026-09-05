import type { Logger } from 'pino'
import type { SystemHealthSnapshot } from '@rev30/contracts'
import type { AttachmentStorage } from '../../attachments/storage'

const STORAGE_HEALTH_CACHE_MS = 30_000

type StorageHealthResult = SystemHealthSnapshot['storage']

export function createStorageHealthCheck(options: {
  storage: Pick<AttachmentStorage, 'provider' | 'checkHealth'>
  now?: () => Date
  monotonicNow?: () => number
}) {
  const { storage } = options
  const now = options.now ?? (() => new Date())
  const monotonicNow = options.monotonicNow ?? (() => performance.now())
  let completed: { result: StorageHealthResult; completedAt: number } | undefined
  let pending: Promise<StorageHealthResult> | undefined

  async function run(requestLogger: Pick<Logger, 'error'>): Promise<StorageHealthResult> {
    const startedAt = monotonicNow()
    let status: StorageHealthResult['status'] = 'healthy'
    try {
      await storage.checkHealth()
    } catch (err) {
      status = 'unavailable'
      requestLogger.error({ component: 'storage', err }, 'system health check failed')
    }
    const completedAt = monotonicNow()
    const result: StorageHealthResult = {
      provider: storage.provider,
      status,
      latencyMs: status === 'healthy' ? Math.round(completedAt - startedAt) : null,
      checkedAt: now().toISOString(),
      cached: false,
    }
    completed = { result, completedAt }
    return result
  }

  return async (requestLogger: Pick<Logger, 'error'>): Promise<StorageHealthResult> => {
    if (completed && monotonicNow() - completed.completedAt < STORAGE_HEALTH_CACHE_MS) {
      return { ...completed.result, cached: true }
    }
    pending ??= run(requestLogger).finally(() => {
      pending = undefined
    })
    return { ...(await pending) }
  }
}
