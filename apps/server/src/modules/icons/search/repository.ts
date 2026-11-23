import { sql } from 'drizzle-orm'
import type { IconSearchQuery } from '@rev30/contracts'
import type { Db } from '../../../db'
import { formatIconSearchCursor, parseIconSearchCursor } from '../cursor'
import { IconSearchPreparingError } from '../errors'
import type { IconSearchMetadata } from './facts'
import { assertIconSearchAvailable, getCommittedIconSearchState } from './indexing/state'
import { planIconSearchQuery } from './planner'
import { findRankedIconSearchRows } from './ranked-rows'
import { getIconSearchDictionary } from './dictionary'

type SearchOptions = IconSearchQuery & {
  source?: IconSearchMetadata['source']
  prefix?: string
  cursor?: string
}

export async function searchIconDocuments(
  database: Db,
  { keyword, source, prefix, cursor, limit }: SearchOptions,
) {
  const dictionary = getIconSearchDictionary()
  assertIconSearchAvailable()
  const plan = planIconSearchQuery(keyword, dictionary)
  const { rows, cursorOptions } = await database.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtext('icon-search-rebuild'))`)
      const state = await getCommittedIconSearchState(tx)
      if (!state) throw new IconSearchPreparingError()

      const cursorOptions = {
        query: keyword,
        source: source ?? ('all' as const),
        ...(prefix ? { prefix } : {}),
        dataVersion: state.indexVersion,
        queryRulesVersion: dictionary.queryRulesVersion,
      }
      const after = parseIconSearchCursor(cursor, cursorOptions)
      const rows = await findRankedIconSearchRows(tx, plan, {
        ...(source ? { source } : {}),
        ...(prefix ? { prefix } : {}),
        ...(after ? { after } : {}),
        limit,
      })
      return { rows, cursorOptions }
    },
    { accessMode: 'read only', isolationLevel: 'read committed' },
  )

  const pageRows = rows.slice(0, limit)
  const last = pageRows.at(-1)
  const nextCursor =
    rows.length > limit && last
      ? formatIconSearchCursor(cursorOptions, {
          tier: last.tier,
          matchScore: last.matchScore,
          rank: last.rank,
          preference: last.preference,
          id: last.id,
        })
      : null
  return { rows: pageRows, nextCursor, indexVersion: cursorOptions.dataVersion }
}
