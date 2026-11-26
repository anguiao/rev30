import { sql, type SQL } from 'drizzle-orm'
import type { SearchCursorPosition } from '../cursor'
import type { IconSearchMetadata } from './facts'
import type { IconSearchQueryPlan } from './planner'
import { compileRankedIconSearch } from './ranked-query'

export type RankedIconSearchRow = Omit<IconSearchMetadata, 'source'> & SearchCursorPosition

type RankedRowsOptions = {
  source?: IconSearchMetadata['source']
  prefix?: string
  after?: SearchCursorPosition
  limit: number
}

export async function findRankedIconSearchRows(
  executor: { execute(statement: SQL, mode: 'objects'): Promise<RankedIconSearchRow[]> },
  plan: IconSearchQueryPlan,
  { source, prefix, after, limit }: RankedRowsOptions,
): Promise<RankedIconSearchRow[]> {
  const { tiers, rank } = compileRankedIconSearch(plan)
  const sourceFilter = source ? sql`AND source = ${source}` : sql``
  const prefixFilter = prefix ? sql`AND prefix = ${prefix}` : sql``
  const rows: RankedIconSearchRow[] = []
  const pageSize = limit + 1

  for (const { tier, condition, matchScore } of tiers) {
    if (after && tier < after.tier) continue
    const seek =
      after && tier === after.tier
        ? sql`WHERE (-match_score, -rank, -(preference::bigint), id COLLATE "C") >
            (${-after.matchScore}, -(${after.rank}::real), ${-after.preference}::bigint, ${after.id})`
        : sql``
    const statement = sql`
      WITH page AS (
        SELECT * FROM (
          SELECT ctid AS row_id, id, (${matchScore}) AS match_score, (${rank}) AS rank, preference
          FROM icon_search_documents
          WHERE ${condition} ${sourceFilter} ${prefixFilter}
        ) AS scored
        ${seek}
        ORDER BY match_score DESC, rank DESC, preference DESC, id COLLATE "C"
        LIMIT ${pageSize - rows.length}
      )
      SELECT document.id, document.prefix, document.name, document.collection,
        document.palette, document.custom_icon_id AS "customIconId", ${tier}::integer AS tier,
        page.match_score AS "matchScore", page.rank::text AS rank, page.preference
      FROM page
      JOIN icon_search_documents AS document ON document.ctid = page.row_id
      ORDER BY page.match_score DESC, page.rank DESC, page.preference DESC, page.id COLLATE "C"
    `
    const page = await executor.execute(statement, 'objects')
    rows.push(...page)
    if (rows.length === pageSize) break
  }
  return rows
}
