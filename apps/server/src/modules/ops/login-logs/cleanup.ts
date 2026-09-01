import { subMilliseconds } from '@rev30/utils'
import { lte } from 'drizzle-orm'
import type { Db } from '../../../db'
import { opsLoginLogs } from '../../../db/schema'

export async function cleanupLoginLogs(database: Db, retentionMs: number): Promise<number> {
  const cutoff = subMilliseconds(new Date(), retentionMs)
  const deleted = await database
    .delete(opsLoginLogs)
    .where(lte(opsLoginLogs.createdAt, cutoff))
    .returning()

  return deleted.length
}
