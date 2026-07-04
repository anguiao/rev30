import {
  iconifyIconNamePattern,
  type IconSearchItem,
  type IconSearchQuery,
  type IconSearchResponse,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import { loadIconCollections } from './collections'
import { toCustomIconSearchItem } from './mapper'
import { expandSearchCandidates } from './query'
import { recallCandidates, scoreIconSearchItem } from './ranking'
import { resolveCustomExactIconSearch, searchCustomIcons } from './repository'
import { getBuiltinSearchIndex, toBuiltinIconSearchItem } from './search-index'
import { getBuiltinIconSubset } from '../service'

async function resolveBuiltinExactIconSearch(
  prefix: string,
  name: string,
): Promise<IconSearchItem[] | null> {
  const collections = await loadIconCollections()
  const collectionInfo = collections[prefix]

  if (!collectionInfo) {
    return null
  }

  const subset = await getBuiltinIconSubset(prefix, [name])

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

async function resolveExactIconSearch(
  prefix: string,
  name: string,
  database: Db,
): Promise<IconSearchItem[]> {
  const builtinItems = await resolveBuiltinExactIconSearch(prefix, name)

  if (builtinItems !== null) {
    return builtinItems
  }

  const customRows = await resolveCustomExactIconSearch(database, prefix, name)

  return customRows.map(toCustomIconSearchItem)
}

async function searchIcons(query: IconSearchQuery, database: Db): Promise<IconSearchResponse> {
  const keyword = query.keyword.trim().toLowerCase()

  if (iconifyIconNamePattern.test(keyword)) {
    const [prefix, name] = keyword.split(':') as [string, string]
    const exactItems = await resolveExactIconSearch(prefix, name, database)

    return {
      list: exactItems.slice(0, query.limit),
    }
  }

  const builtinIndex = await getBuiltinSearchIndex()

  if (!keyword) {
    return {
      list: builtinIndex.recommended
        .slice(0, query.limit)
        .map((id) => toBuiltinIconSearchItem(builtinIndex, id)),
    }
  }

  const expandedSearch = expandSearchCandidates(keyword)
  const builtinIds = await recallCandidates(builtinIndex, expandedSearch, query.limit)
  const builtinItems = builtinIds.map((id) => toBuiltinIconSearchItem(builtinIndex, id))
  const customRows = await searchCustomIcons(database, expandedSearch, query.limit)
  const customItems = customRows.map(toCustomIconSearchItem)
  const ranked = [...builtinItems, ...customItems]
    .map((item, indexOrder) => ({
      item,
      score: scoreIconSearchItem(item, expandedSearch),
      indexOrder,
    }))
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

export function createIconSearchService(database: Db) {
  return {
    searchIcons: (query: IconSearchQuery) => searchIcons(query, database),
  }
}
