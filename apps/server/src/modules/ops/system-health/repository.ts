import { and, count, eq, lt, min, sql } from 'drizzle-orm'
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
