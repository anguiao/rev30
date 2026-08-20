import { subMilliseconds } from '@rev30/utils'
import { lte } from 'drizzle-orm'
import type { Db } from '../../../db'
import { opsOperationLogs } from '../../../db/schema'

export async function cleanupOperationLogs(
  database: Db,
  retentionMs: number,
  now = new Date(),
): Promise<number> {
  const cutoff = subMilliseconds(now, retentionMs)
  const deleted = await database
    .delete(opsOperationLogs)
    .where(lte(opsOperationLogs.createdAt, cutoff))
    .returning()

  return deleted.length
}
