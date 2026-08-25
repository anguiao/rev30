import { subMilliseconds } from '@rev30/utils'
import { and, lte, ne, sql } from 'drizzle-orm'
import type { Db } from '../../../db'
import { opsJobRuns, opsScheduledJobs } from '../../../db/schema'

export async function cleanupScheduledJobRuns(database: Db, retentionMs: number, now = new Date()) {
  const cutoff = subMilliseconds(now, retentionMs)
  const deleted = await database
    .delete(opsJobRuns)
    .where(
      and(
        ne(opsJobRuns.status, 'running'),
        lte(opsJobRuns.finishedAt, cutoff),
        sql`not exists (
          select 1
          from ${opsScheduledJobs}
          where ${opsScheduledJobs.activeRunId} = ${opsJobRuns.id}
        )`,
      ),
    )
    .returning()

  return { deletedCount: deleted.length, failedCount: 0 as const }
}
