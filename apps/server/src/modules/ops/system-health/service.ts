import {
  scheduledJobErrorCategorySchema,
  scheduledJobRunStatusSchema,
  type SystemHealthIssue,
  type SystemHealthJobStatistics,
  type SystemHealthRecentAnomaly,
  type SystemHealthSnapshot,
} from '@rev30/contracts'
import type { Logger } from 'pino'
import type { Db } from '../../../db'
import { readAttachmentConfig } from '../../attachments/config'
import { createAttachmentStorage } from '../../attachments/storage'
import type { ScheduledJobService } from '../scheduled-jobs/service'
import { createSystemHealthRepository } from './repository'
import { createStorageHealthCheck } from './storage'

const shanghaiDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function emptyStatusCounts(): SystemHealthJobStatistics['statusDistribution'] {
  return { running: 0, success: 0, failure: 0, skipped: 0, cancelled: 0, interrupted: 0 }
}

function dailyBuckets(generatedAt: Date): SystemHealthJobStatistics['dailyRuns'] {
  const parts = Object.fromEntries(
    shanghaiDateFormatter.formatToParts(generatedAt).map((part) => [part.type, part.value]),
  )
  const calendarDay = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  return Array.from({ length: 7 }, (_, index) => ({
    date: new Date(calendarDay - (6 - index) * 86_400_000).toISOString().slice(0, 10),
    ...emptyStatusCounts(),
  }))
}

export function createSystemHealthService(
  database: Db,
  scheduledJobs: Pick<ScheduledJobService, 'diagnostics' | 'getTaskName'>,
) {
  const repository = createSystemHealthRepository(database)
  const checkStorageHealth = createStorageHealthCheck({
    storage: createAttachmentStorage(readAttachmentConfig()),
  })
  const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString()

  return {
    async jobStatistics(): Promise<SystemHealthJobStatistics> {
      const generatedAt = new Date()
      const rows = await repository.readJobStatistics(generatedAt)
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
          taskName: scheduledJobs.getTaskName(row.taskKey),
          averageDurationMs: Math.round(row.averageDurationMs!),
          runCount: row.runCount,
        }))
        .sort(
          (left, right) =>
            right.averageDurationMs - left.averageDurationMs ||
            left.taskKey.localeCompare(right.taskKey),
        )
        .slice(0, 5)
      const recentAnomalies = rows.recentAnomalies.map((row): SystemHealthRecentAnomaly => {
        const common = {
          taskKey: row.taskKey,
          taskName: scheduledJobs.getTaskName(row.taskKey),
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
      })
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

    async snapshot(requestLogger: Pick<Logger, 'error'>): Promise<SystemHealthSnapshot> {
      const observedAt = new Date()
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
      const scheduler = scheduledJobs.diagnostics()
      const [databaseResult, storageResult] = await Promise.allSettled([
        repository.readSnapshot(observedAt),
        checkStorageHealth(requestLogger),
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
        requestLogger.error(
          { component: 'database', err: databaseResult.reason },
          'system health check failed',
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
