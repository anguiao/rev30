import {
  iconifyIconNamePattern,
  type IconSearchItem,
  type IconSearchQuery,
  type IconSearchResponse,
} from '@rev30/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../../db'
import { customIconSetIcons, customIconSets } from '../../../db/schema'
import { loadIconCollections } from './collections'
import { expandSearchCandidates } from './query'
import { recallCandidates, scoreSearchItem } from './ranking'
import {
  buildCustomSearchIndex,
  buildCustomSearchItems,
  getSearchIndex,
  toResponseItem,
} from './search-index'
import type { ExpandedSearch, SearchIndex } from './types'
import { getIconSubset } from '../service'

type RankedIconSearchItem = {
  indexOrder: number
  item: IconSearchItem
  score: number
}

async function resolveBuiltinExactIconSearch(
  prefix: string,
  name: string,
): Promise<IconSearchItem[] | null> {
  const collections = await loadIconCollections()
  const collectionInfo = collections[prefix]

  if (!collectionInfo) {
    return null
  }

  const subset = await getIconSubset(prefix, [name])

  if (!subset || subset.not_found?.includes(name)) {
    return []
  }

  if (!subset.icons[name] && !subset.aliases?.[name]) {
    return []
  }

  return [
    {
      icon: `${prefix}:${name}`,
      prefix,
      name,
      collection: collectionInfo.name.trim() || prefix,
      palette: Boolean(collectionInfo.palette),
    },
  ]
}

async function resolveCustomExactIconSearch(
  database: Db,
  prefix: string,
  name: string,
): Promise<IconSearchItem[]> {
  const [row] = await database
    .select({
      prefix: customIconSets.prefix,
      collection: customIconSets.name,
      name: customIconSetIcons.name,
      palette: customIconSetIcons.palette,
    })
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

  if (!row) {
    return []
  }

  return [
    {
      icon: `${row.prefix}:${row.name}`,
      prefix: row.prefix,
      name: row.name,
      collection: row.collection,
      palette: row.palette,
    },
  ]
}

async function resolveExactIconSearch(
  keyword: string,
  database?: Db,
): Promise<IconSearchItem[] | null> {
  const normalizedKeyword = keyword.toLowerCase()

  if (!iconifyIconNamePattern.test(normalizedKeyword)) {
    return null
  }

  const [prefix, name] = normalizedKeyword.split(':') as [string, string]
  const builtinItems = await resolveBuiltinExactIconSearch(prefix, name)

  if (builtinItems?.length || !database) {
    return builtinItems ?? []
  }

  return await resolveCustomExactIconSearch(database, prefix, name)
}

async function searchIconsWithDatabase(
  query: IconSearchQuery,
  database?: Db,
): Promise<IconSearchResponse> {
  const keyword = query.keyword.trim()
  const exactItems = await resolveExactIconSearch(keyword, database)

  if (exactItems) {
    return {
      list: exactItems.slice(0, query.limit),
    }
  }

  const builtinIndex = await getSearchIndex()

  if (!keyword) {
    return {
      list: builtinIndex.recommended
        .slice(0, query.limit)
        .map((id) => toResponseItem(builtinIndex, id)),
    }
  }

  const search = expandSearchCandidates(keyword)
  const builtinRanked = await rankSearchIndexItems(builtinIndex, search, query.limit, 0)
  const customItems = database ? await buildCustomSearchItems(database) : []
  const customRanked =
    customItems.length > 0
      ? await rankSearchIndexItems(
          buildCustomSearchIndex(customItems),
          search,
          query.limit,
          builtinRanked.length,
        )
      : []
  const ranked = [...builtinRanked, ...customRanked]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.indexOrder - right.indexOrder
    })
    .slice(0, query.limit)
    .map(({ item }) => item)

  return { list: ranked }
}

async function rankSearchIndexItems(
  index: SearchIndex,
  search: ExpandedSearch,
  limit: number,
  indexOrderOffset: number,
): Promise<RankedIconSearchItem[]> {
  const recalled = await recallCandidates(index, search, limit)

  return recalled.map((id, indexOrder) => ({
    item: toResponseItem(index, id),
    score: scoreSearchItem(index, id, search),
    indexOrder: indexOrderOffset + indexOrder,
  }))
}

export async function searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
  return await searchIconsWithDatabase(query)
}

export function createIconSearchService(database: Db) {
  return {
    searchIcons: (query: IconSearchQuery) => searchIconsWithDatabase(query, database),
  }
}
