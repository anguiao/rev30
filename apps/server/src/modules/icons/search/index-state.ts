import { eq, sql } from 'drizzle-orm'
import type { DbExecutor, DbReader } from '../../../db'
import { iconSearchIndexState } from '../../../db/schema'

export type IconSearchStateInput = {
  indexVersion: string
  iconPackageVersion: string
  searchDataVersion: string
  rulesVersion: string
}

export async function getCommittedIconSearchState(database: DbReader) {
  const [state] = await database
    .select()
    .from(iconSearchIndexState)
    .where(eq(iconSearchIndexState.key, 'current'))
    .limit(1)
  return state
}

export async function lockIconSearchWrites(executor: DbExecutor) {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext('icon-search-rebuild'))`)
}
