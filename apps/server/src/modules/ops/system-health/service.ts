import type { SystemHealthIssue, SystemHealthSnapshot } from '@rev30/contracts'
import type { Logger } from 'pino'
import type { ScheduledJobDiagnostics } from '../scheduled-jobs/scheduler'
import type { SystemHealthRepository } from './repository'
import type { createSystemHealthStorageProbe } from './storage-probe'

type SystemHealthServiceOptions = {
  repository: SystemHealthRepository
  diagnostics: () => ScheduledJobDiagnostics
  storageProbe: ReturnType<typeof createSystemHealthStorageProbe>
  logger: Pick<Logger, 'error'>
  now?: () => Date
}

export function createSystemHealthService(options: SystemHealthServiceOptions) {
  const now = options.now ?? (() => new Date())
  const startedAt = new Date(now().getTime() - process.uptime() * 1000).toISOString()

  return {
    async snapshot(): Promise<SystemHealthSnapshot> {
      const observedAt = now()
      const memory = process.memoryUsage()
      const instance: SystemHealthSnapshot['instance'] = {
        startedAt,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          externalBytes: memory.external,
        },
      }
      const scheduler = options.diagnostics()
      const [databaseResult, storageResult] = await Promise.allSettled([
        options.repository.readSnapshot(observedAt),
        options.storageProbe(),
      ])
      const issues: SystemHealthIssue[] = []
      let database: SystemHealthSnapshot['database']
      let shared: SystemHealthSnapshot['scheduler']['shared']
      if (databaseResult.status === 'fulfilled') {
        const result = databaseResult.value
        database = {
          status: 'healthy',
          latencyMs: result.latencyMs,
          checkedAt: result.checkedAt.toISOString(),
        }
        shared = {
          runningCount: result.runningCount,
          overdueCount: result.overdueCount,
          oldestOverdueAt:
            result.oldestOverdueAt === null ? null : result.oldestOverdueAt.toISOString(),
        }
      } else {
        options.logger.error(
          { component: 'database', err: databaseResult.reason },
          'system health probe failed',
        )
        issues.push('database_unavailable')
        database = { status: 'unavailable', latencyMs: null, checkedAt: observedAt.toISOString() }
        shared = { runningCount: null, overdueCount: null, oldestOverdueAt: null }
      }
      if (storageResult.status === 'rejected') throw storageResult.reason
      const storage = storageResult.value
      if (storage.status === 'unavailable') issues.push('storage_unavailable')
      if (scheduler.runtimeStatus === 'stopped') issues.push('scheduler_stopped')
      if (scheduler.retryPending || scheduler.lastPollStatus === 'failure')
        issues.push('scheduler_query_retry')
      if (shared.overdueCount !== null && shared.overdueCount > 0) issues.push('scheduler_overdue')

      return {
        observedAt: observedAt.toISOString(),
        status:
          database.status === 'unavailable'
            ? 'unhealthy'
            : issues.length > 0
              ? 'degraded'
              : 'healthy',
        issues,
        instance,
        database,
        storage,
        scheduler: { ...scheduler, shared },
      }
    },
  }
}

export type SystemHealthService = ReturnType<typeof createSystemHealthService>
