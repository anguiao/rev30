import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm'
import type { Db } from '../../../db'
import { customIconSetIcons, customIconSets } from '../../../db/schema'
import type { CustomIconSearchRow } from './mapper'
import type { ExpandedSearch } from './types'

const customSearchCandidateLimitFactor = 4
const customSearchCandidateMinLimit = 60

const customIconSearchColumns = {
  prefix: customIconSets.prefix,
  collection: customIconSets.name,
  name: customIconSetIcons.name,
  palette: customIconSetIcons.palette,
} satisfies Record<keyof CustomIconSearchRow, unknown>

export async function resolveCustomExactIconSearch(
  database: Db,
  prefix: string,
  name: string,
): Promise<CustomIconSearchRow[]> {
  const [row] = await database
    .select(customIconSearchColumns)
    .from(customIconSetIcons)
    .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
    .where(
      and(
        eq(customIconSets.prefix, prefix),
        eq(customIconSetIcons.name, name),
        isNull(customIconSets.deletedAt),
        isNull(customIconSetIcons.deletedAt),
      ),
    )
    .limit(1)

  return row ? [row] : []
}

export async function searchCustomIcons(
  database: Db,
  expandedSearch: ExpandedSearch,
  limit: number,
): Promise<CustomIconSearchRow[]> {
  if (expandedSearch.candidates.length === 0) {
    return []
  }

  const candidateFilters = expandedSearch.candidates.map((candidate) => {
    const pattern = `%${candidate}%`

    return or(
      ilike(customIconSets.prefix, pattern),
      ilike(customIconSets.name, pattern),
      ilike(customIconSetIcons.name, pattern),
    )
  })
  const rows = await database
    .select(customIconSearchColumns)
    .from(customIconSetIcons)
    .innerJoin(customIconSets, eq(customIconSetIcons.setId, customIconSets.id))
    .where(
      and(
        isNull(customIconSets.deletedAt),
        isNull(customIconSetIcons.deletedAt),
        or(...candidateFilters),
      ),
    )
    .orderBy(asc(customIconSets.prefix), asc(customIconSetIcons.name))
    .limit(Math.max(limit * customSearchCandidateLimitFactor, customSearchCandidateMinLimit))

  return rows
}
