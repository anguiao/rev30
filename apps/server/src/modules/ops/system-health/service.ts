import {
  scheduledJobErrorCategorySchema,
  scheduledJobRunStatusSchema,
  type SystemHealthIssue,
  type SystemHealthJobStatistics,
  type SystemHealthSnapshot,
} from '@rev30/contracts'
import type { Logger } from 'pino'
import type { ScheduledJobDefinition } from '../scheduled-jobs/registry'
import type { ScheduledJobDiagnostics } from '../scheduled-jobs/scheduler'
import type { SystemHealthRepository } from './repository'
import type { createSystemHealthStorageProbe } from './storage-probe'

type SystemHealthServiceOptions = {
  repository: SystemHealthRepository
  taskCatalog: readonly Readonly<Pick<ScheduledJobDefinition, 'key' | 'name'>>[]
  diagnostics: () => ScheduledJobDiagnostics
  storageProbe: ReturnType<typeof createSystemHealthStorageProbe>
  logger: Pick<Logger, 'error'>
  now?: () => Date
}

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function emptyStatusCounts(): SystemHealthJobStatistics['statusDistribution'] {
  return { running: 0, success: 0, failure: 0, skipped: 0, cancelled: 0, interrupted: 0 }
}

function dailyBuckets(generatedAt: Date): SystemHealthJobStatistics['dailyRuns'] {
  const calendarDay = Date.parse(`${shanghaiDateFormatter.format(generatedAt)}T00:00:00.000Z`)
  return Array.from({ length: 7 }, (_, index) => ({
    date: new Date(calendarDay - (6 - index) * 86_400_000).toISOString().slice(0, 10),
    ...emptyStatusCounts(),
  }))
}

export function createSystemHealthService(options: SystemHealthServiceOptions) {
  const now = options.now ?? (() => new Date())
  const startedAt = new Date(now().getTime() - process.uptime() * 1000).toISOString()
  const taskNames = new Map(options.taskCatalog.map(({ key, name }) => [key, name]))

  function taskName(taskKey: string) {
    const name = taskNames.get(taskKey)
    if (name === undefined) throw new Error(`Unknown scheduled job task: ${taskKey}`)
    return name
  }

  return {
    async jobStatistics(): Promise<SystemHealthJobStatistics> {
      const generatedAt = now()
      const rows = await options.repository.readJobStatistics(generatedAt)
      const dailyRuns = dailyBuckets(generatedAt)
      const dailyByDate = new Map(dailyRuns.map((bucket) => [bucket.date, bucket]))
      for (const row of rows.dailyRuns) {
        dailyByDate.get(row.date)![scheduledJobRunStatusSchema.parse(row.status)] = row.count
      }
      const statusDistribution = emptyStatusCounts()
      for (const row of rows.statusDistribution) {
        statusDistribution[scheduledJobRunStatusSchema.parse(row.status)] = row.count
      }
      const failureCounts = new Map(
        rows.failureCategories.map((row) => [
          scheduledJobErrorCategorySchema.parse(row.category),
          row.count,
        ]),
      )
      const failureCategories = scheduledJobErrorCategorySchema.options.map((category) => ({
        category,
        count: failureCounts.get(category) ?? 0,
      }))
      const averageDurations = rows.averageDurations
        .map((row) => ({
          taskKey: row.taskKey,
          taskName: taskName(row.taskKey),
          averageDurationMs: Math.round(row.averageDurationMs!),
          runCount: row.runCount,
        }))
        .sort(
          (left, right) =>
            right.averageDurationMs - left.averageDurationMs ||
            left.taskKey.localeCompare(right.taskKey),
        )
        .slice(0, 5)
      const recentAnomalies = rows.recentAnomalies.map(
        (row): SystemHealthJobStatistics['recentAnomalies'][number] => {
          const common = {
            taskKey: row.taskKey,
            taskName: taskName(row.taskKey),
            runId: row.runId,
            finishedAt: row.finishedAt!.toISOString(),
          }
          if (row.status === 'failure') {
            return {
              ...common,
              status: 'failure',
              errorCategory: scheduledJobErrorCategorySchema.parse(row.errorCategory),
              errorSummary: row.errorSummary!,
            }
          }
          if (row.status === 'interrupted') {
            return { ...common, status: 'interrupted', errorCategory: null, errorSummary: null }
          }
          throw new Error(`Unexpected scheduled job anomaly status: ${row.status}`)
        },
      )
      return {
        generatedAt: generatedAt.toISOString(),
        timezone: 'Asia/Shanghai',
        dailyRuns,
        statusDistribution,
        failureCategories,
        averageDurations,
        recentAnomalies,
      }
    },

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
