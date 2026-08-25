import { subMilliseconds } from '@rev30/utils'
import { lte } from 'drizzle-orm'
import type { Db } from '../../../db'
import { opsLoginLogs } from '../../../db/schema'

export async function cleanupLoginLogs(
  database: Db,
  retentionMs: number,
  now = new Date(),
): Promise<number> {
  const cutoff = subMilliseconds(now, retentionMs)
  const deleted = await database
    .delete(opsLoginLogs)
    .where(lte(opsLoginLogs.createdAt, cutoff))
    .returning()

  return deleted.length
}
