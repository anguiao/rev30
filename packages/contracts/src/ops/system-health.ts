import { z } from 'zod'
import {
  scheduledJobErrorCategorySchema,
  scheduledJobRunDetailSchema,
  scheduledJobRunPathSchema,
  scheduledJobSchema,
  scheduledJobTaskKeySchema,
} from './scheduled-jobs'

export const systemHealthStatusSchema = z.enum(
  ['healthy', 'degraded', 'unhealthy'],
  '系统健康状态无效',
)
export const systemHealthIssueSchema = z.enum(
  [
    'database_unavailable',
    'storage_unavailable',
    'scheduler_stopped',
    'scheduler_query_retry',
    'scheduler_overdue',
  ],
  '系统健康问题无效',
)

const measurementSchema = z
  .number('健康指标必须是非负安全整数')
  .int('健康指标必须是非负安全整数')
  .min(0, '健康指标必须是非负安全整数')
  .max(Number.MAX_SAFE_INTEGER, '健康指标必须是非负安全整数')
const dateTimeSchema = z.iso.datetime()
const dependencyStatusSchema = z.enum(['healthy', 'unavailable'])

export const systemHealthSnapshotSchema = z
  .object({
    observedAt: dateTimeSchema,
    status: systemHealthStatusSchema,
    issues: z.array(systemHealthIssueSchema),
    instance: z
      .object({
        startedAt: dateTimeSchema,
        uptimeSeconds: measurementSchema,
        nodeVersion: z.string(),
        platform: z.string(),
        arch: z.string(),
        memory: z
          .object({
            rssBytes: measurementSchema,
            heapUsedBytes: measurementSchema,
            heapTotalBytes: measurementSchema,
            externalBytes: measurementSchema,
          })
          .strict(),
      })
      .strict(),
    database: z
      .object({
        status: dependencyStatusSchema,
        latencyMs: measurementSchema.nullable(),
        checkedAt: dateTimeSchema,
      })
      .strict(),
    storage: z
      .object({
        status: dependencyStatusSchema,
        provider: z.string(),
        latencyMs: measurementSchema.nullable(),
        checkedAt: dateTimeSchema,
        cached: z.boolean(),
      })
      .strict(),
    scheduler: z
      .object({
        runtimeStatus: z.enum(['running', 'stopped']),
        automaticCapacity: measurementSchema,
        automaticRunning: measurementSchema,
        manualStarting: measurementSchema,
        recoveryQueued: measurementSchema,
        retryPending: z.boolean(),
        nextWakeAt: dateTimeSchema.nullable(),
        lastPollAt: dateTimeSchema.nullable(),
        lastPollStatus: z.enum(['success', 'failure']).nullable(),
        shared: z
          .object({
            runningCount: measurementSchema.nullable(),
            overdueCount: measurementSchema.nullable(),
            oldestOverdueAt: dateTimeSchema.nullable(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()

const statusCountsSchema = z
  .object({
    running: measurementSchema,
    success: measurementSchema,
    failure: measurementSchema,
    skipped: measurementSchema,
    cancelled: measurementSchema,
    interrupted: measurementSchema,
  })
  .strict()
const recentAnomalyBaseSchema = z
  .object({
    taskKey: scheduledJobTaskKeySchema,
    taskName: scheduledJobSchema.shape.name,
    runId: scheduledJobRunPathSchema.shape.runId,
    finishedAt: dateTimeSchema,
  })
  .strict()
const recentAnomalySchema = z.discriminatedUnion('status', [
  recentAnomalyBaseSchema.extend({
    status: z.literal('failure'),
    errorCategory: scheduledJobErrorCategorySchema,
    errorSummary: scheduledJobRunDetailSchema.shape.errorSummary.unwrap(),
  }),
  recentAnomalyBaseSchema.extend({
    status: z.literal('interrupted'),
    errorCategory: z.null(),
    errorSummary: z.null(),
  }),
])

export const systemHealthJobStatisticsSchema = z
  .object({
    generatedAt: dateTimeSchema,
    timezone: z.literal('Asia/Shanghai'),
    dailyRuns: z
      .array(statusCountsSchema.extend({ date: z.iso.date() }))
      .length(7, '每日统计必须包含 7 天'),
    statusDistribution: statusCountsSchema,
    failureCategories: z
      .array(
        z.object({ category: scheduledJobErrorCategorySchema, count: measurementSchema }).strict(),
      )
      .length(4, '失败分类必须包含 4 项'),
    averageDurations: z
      .array(
        z
          .object({
            taskKey: scheduledJobTaskKeySchema,
            taskName: scheduledJobSchema.shape.name,
            averageDurationMs: measurementSchema,
            runCount: measurementSchema,
          })
          .strict(),
      )
      .max(5, '平均耗时排行最多包含 5 项'),
    recentAnomalies: z.array(recentAnomalySchema).max(5, '最近异常最多包含 5 条'),
  })
  .strict()

export type SystemHealthStatus = z.infer<typeof systemHealthStatusSchema>
export type SystemHealthIssue = z.infer<typeof systemHealthIssueSchema>
export type SystemHealthSnapshot = z.infer<typeof systemHealthSnapshotSchema>
export type SystemHealthRecentAnomaly = z.infer<typeof recentAnomalySchema>
export type SystemHealthJobStatistics = z.infer<typeof systemHealthJobStatisticsSchema>
