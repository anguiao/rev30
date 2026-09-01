import { subMilliseconds } from '@rev30/utils'
import { and, lte, ne, sql } from 'drizzle-orm'
import type { Db } from '../../../db'
import { opsJobRuns, opsScheduledJobs } from '../../../db/schema'

export async function cleanupScheduledJobRuns(database: Db, retentionMs: number) {
  const cutoff = subMilliseconds(new Date(), retentionMs)
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

  return deleted.length
}
