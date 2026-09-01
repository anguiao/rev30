import { subMilliseconds } from '@rev30/utils'
import { lte } from 'drizzle-orm'
import type { Db } from '../../../db'
import { opsOperationLogs } from '../../../db/schema'

export async function cleanupOperationLogs(database: Db, retentionMs: number): Promise<number> {
  const cutoff = subMilliseconds(new Date(), retentionMs)

  if (Number.isNaN(cutoff.getTime())) {
    return 0
  }

  const deleted = await database
    .delete(opsOperationLogs)
    .where(lte(opsOperationLogs.createdAt, cutoff))
    .returning()

  return deleted.length
}
