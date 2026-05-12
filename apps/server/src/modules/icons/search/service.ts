import {
  iconifyIconNamePattern,
  type IconSearchItem,
  type IconSearchQuery,
  type IconSearchResponse,
} from '@rev30/shared'
import { loadIconCollections } from './collections'
import { expandSearchCandidates } from './query'
import { recallCandidates, scoreSearchItem } from './ranking'
import { getSearchIndex, toResponseItem } from './search-index'
import { getIconSubset } from '../service'

async function resolveExactIconSearch(keyword: string): Promise<IconSearchItem[] | null> {
  const normalizedKeyword = keyword.toLowerCase()

  if (!iconifyIconNamePattern.test(normalizedKeyword)) {
    return null
  }

  const [prefix, name] = normalizedKeyword.split(':') as [string, string]
  const collections = await loadIconCollections()
  const collectionInfo = collections[prefix]

  if (!collectionInfo) {
    return []
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

export async function searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
  const keyword = query.keyword.trim()
  const exactItems = await resolveExactIconSearch(keyword)

  if (exactItems) {
    return {
      list: exactItems.slice(0, query.limit),
    }
  }

  const index = await getSearchIndex()

  if (!keyword) {
    return {
      list: index.recommended.slice(0, query.limit).map((id) => toResponseItem(index, id)),
    }
  }

  const search = expandSearchCandidates(keyword)
  const recalled = await recallCandidates(index, search, query.limit)
  const ranked = recalled
    .map((id, indexOrder) => ({
      id,
      score: scoreSearchItem(index, id, search),
      indexOrder,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.indexOrder - right.indexOrder
    })
    .slice(0, query.limit)
    .map(({ id }) => toResponseItem(index, id))

  return { list: ranked }
}
