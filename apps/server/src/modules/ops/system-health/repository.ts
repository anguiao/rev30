import { and, avg, count, desc, eq, gte, inArray, isNotNull, lt, min, sql } from 'drizzle-orm'
import type { Db } from '../../../db'
import { opsJobRuns, opsScheduledJobs } from '../../../db/schema'

const OVERDUE_TOLERANCE_MS = 60_000

export function createSystemHealthRepository(
  database: Db,
  options: { now?: () => Date; monotonicNow?: () => number } = {},
) {
  const now = options.now ?? (() => new Date())
  const monotonicNow = options.monotonicNow ?? (() => performance.now())

  return {
    async readJobStatistics(generatedAt: Date) {
      const localDate = sql`(${generatedAt.toISOString()}::timestamptz AT TIME ZONE 'Asia/Shanghai')::date`
      const dailyWindow = and(
        gte(
          opsJobRuns.createdAt,
          sql`(${localDate} - interval '6 days') AT TIME ZONE 'Asia/Shanghai'`,
        ),
        lt(opsJobRuns.createdAt, generatedAt),
      )
      const monthlyWindow = and(
        gte(
          opsJobRuns.createdAt,
          sql`(${localDate} - interval '29 days') AT TIME ZONE 'Asia/Shanghai'`,
        ),
        lt(opsJobRuns.createdAt, generatedAt),
      )
      const date = sql<string>`to_char(${opsJobRuns.createdAt} AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')`
      const [dailyRuns, statusDistribution, failureCategories, averageDurations, recentAnomalies] =
        await Promise.all([
          database
            .select({ date, status: opsJobRuns.status, count: count() })
            .from(opsJobRuns)
            .where(dailyWindow)
            .groupBy(date, opsJobRuns.status),
          database
            .select({ status: opsJobRuns.status, count: count() })
            .from(opsJobRuns)
            .where(monthlyWindow)
            .groupBy(opsJobRuns.status),
          database
            .select({ category: opsJobRuns.errorCategory, count: count() })
            .from(opsJobRuns)
            .where(and(monthlyWindow, eq(opsJobRuns.status, 'failure')))
            .groupBy(opsJobRuns.errorCategory),
          database
            .select({
              taskKey: opsJobRuns.taskKey,
              averageDurationMs: avg(opsJobRuns.durationMs).mapWith(Number),
              runCount: count(),
            })
            .from(opsJobRuns)
            .where(
              and(
                monthlyWindow,
                eq(opsJobRuns.status, 'success'),
                isNotNull(opsJobRuns.durationMs),
              ),
            )
            .groupBy(opsJobRuns.taskKey),
          database
            .select({
              taskKey: opsJobRuns.taskKey,
              runId: opsJobRuns.id,
              finishedAt: opsJobRuns.finishedAt,
              status: opsJobRuns.status,
              errorCategory: opsJobRuns.errorCategory,
              errorSummary: opsJobRuns.errorSummary,
            })
            .from(opsJobRuns)
            .where(inArray(opsJobRuns.status, ['failure', 'interrupted']))
            .orderBy(desc(opsJobRuns.finishedAt), desc(opsJobRuns.id))
            .limit(5),
        ])
      return { dailyRuns, statusDistribution, failureCategories, averageDurations, recentAnomalies }
    },

    async readSnapshot(observedAt: Date) {
      const startedAt = monotonicNow()
      await database.execute(sql`SELECT 1`)
      const latencyMs = Math.round(monotonicNow() - startedAt)
      const checkedAt = now()
      const [[running], [overdue]] = await Promise.all([
        database
          .select({ runningCount: count() })
          .from(opsJobRuns)
          .where(eq(opsJobRuns.status, 'running')),
        database
          .select({ overdueCount: count(), oldestOverdueAt: min(opsScheduledJobs.nextRunAt) })
          .from(opsScheduledJobs)
          .where(
            and(
              eq(opsScheduledJobs.enabled, true),
              lt(opsScheduledJobs.nextRunAt, new Date(observedAt.getTime() - OVERDUE_TOLERANCE_MS)),
            ),
          ),
      ])
      return { latencyMs, checkedAt, ...running!, ...overdue! }
    },
  }
}

export type SystemHealthRepository = ReturnType<typeof createSystemHealthRepository>
