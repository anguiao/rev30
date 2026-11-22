import { eq, sql } from 'drizzle-orm'
import type { DbExecutor, DbReader } from '../../../../db'
import { iconSearchIndexState } from '../../../../db/schema'
import { IconSearchPreparingError, IconSearchUnavailableError } from '../../errors'

type IconSearchStatus = 'ready' | 'preparing' | 'failed'
let status: IconSearchStatus = 'ready'

export type IconSearchStateInput = {
  indexVersion: string
  iconPackageVersion: string
  indexRulesVersion: string
}

export function setIconSearchStatus(nextStatus: IconSearchStatus) {
  status = nextStatus
}

export function assertIconSearchAvailable() {
  if (status === 'ready') return
  if (status === 'preparing') throw new IconSearchPreparingError()
  throw new IconSearchUnavailableError()
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
