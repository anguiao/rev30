import { lookupCollection } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import type {
  BuiltinIconListResponse,
  BuiltinIconSetListResponse,
  IconSetIconItem,
  IconSetIconListQuery,
  IconSetListQuery,
} from '@rev30/contracts'
import { getIconData } from '@iconify/utils'
import { type IconCollections, loadIconCollections } from '../../../icons/search/collections'

function matchesKeyword(value: string, keyword?: string) {
  if (!keyword) {
    return true
  }

  return value.toLowerCase().includes(keyword)
}

function mapIconSetIconItem(iconSet: IconifyJSON, name: string) {
  const icon = getIconData(iconSet, name)

  if (!icon?.body) {
    return undefined
  }

  const row: IconSetIconItem = {
    icon: `${iconSet.prefix}:${name}`,
    prefix: iconSet.prefix,
    name,
    setName: iconSet.info?.name ?? '',
    body: icon.body,
    width: icon.width ?? iconSet.width ?? 16,
    height: icon.height ?? iconSet.height ?? 16,
  }

  return row
}

async function listSingleSetIcons(
  prefix: string,
  query: IconSetIconListQuery,
): Promise<BuiltinIconListResponse> {
  const iconSet = await lookupCollection(prefix)
  const names = Object.keys(iconSet.icons).sort((left, right) => left.localeCompare(right))
  const offset = (query.page - 1) * query.pageSize
  const list = names
    .slice(offset, offset + query.pageSize)
    .map((name) => mapIconSetIconItem(iconSet, name))
    .filter((item): item is IconSetIconItem => item !== undefined)

  return {
    list,
    total: names.length,
    page: query.page,
    pageSize: query.pageSize,
  }
}

async function listAllSetIcons(
  query: IconSetIconListQuery,
  collections: IconCollections,
): Promise<BuiltinIconListResponse> {
  const offset = (query.page - 1) * query.pageSize
  const list: IconSetIconItem[] = []
  const collectionEntries = Object.entries(collections)
  const total = collectionEntries.reduce((sum, [, collection]) => sum + (collection.total ?? 0), 0)
  let skipped = offset

  for (const [prefix, collection] of collectionEntries) {
    const collectionTotal = collection.total ?? 0

    if (skipped >= collectionTotal) {
      skipped -= collectionTotal
      continue
    }

    const iconSet = await lookupCollection(prefix)
    const names = Object.keys(iconSet.icons).sort((left, right) => left.localeCompare(right))

    for (let index = skipped; index < names.length; index += 1) {
      const name = names[index]

      if (!name) {
        continue
      }

      const row = mapIconSetIconItem(iconSet, name)

      if (!row) {
        continue
      }

      list.push(row)

      if (list.length >= query.pageSize) {
        return {
          list,
          total,
          page: query.page,
          pageSize: query.pageSize,
        }
      }
    }

    skipped = 0
  }

  return {
    list,
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
}

async function searchIcons(
  keyword: string,
  query: IconSetIconListQuery,
  collections: IconCollections,
): Promise<BuiltinIconListResponse> {
  const prefixes = query.prefix ? [query.prefix] : Object.keys(collections)
  const offset = (query.page - 1) * query.pageSize
  const list: IconSetIconItem[] = []
  let total = 0

  for (const prefix of prefixes) {
    const iconSet = await lookupCollection(prefix)
    const names = [
      ...new Set([...Object.keys(iconSet.icons), ...Object.keys(iconSet.aliases ?? {})]),
    ].sort((left, right) => left.localeCompare(right))

    for (const name of names) {
      const fullName = `${prefix}:${name}`

      if (!matchesKeyword(name, keyword) && !matchesKeyword(fullName, keyword)) {
        continue
      }

      const row = mapIconSetIconItem(iconSet, name)

      if (!row) {
        continue
      }

      total += 1

      if (total <= offset || list.length >= query.pageSize) {
        continue
      }

      list.push(row)
    }
  }

  return {
    list,
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
}

export async function listBuiltinIconSets(
  query: IconSetListQuery,
): Promise<BuiltinIconSetListResponse> {
  const collections = await loadIconCollections()
  const keyword = query.keyword?.toLowerCase()
  const list = Object.entries(collections)
    .map(([prefix, collection]) => ({
      prefix,
      name: collection.name ?? prefix,
      total: collection.total ?? 0,
    }))
    .filter((item) => matchesKeyword(item.prefix, keyword) || matchesKeyword(item.name, keyword))

  return {
    list,
    total: list.length,
  }
}

export async function listBuiltinIcons(
  query: IconSetIconListQuery,
): Promise<BuiltinIconListResponse> {
  const collections = await loadIconCollections()
  const keyword = query.keyword?.toLowerCase()

  if (query.prefix && !collections[query.prefix]) {
    return {
      list: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  if (keyword) {
    return await searchIcons(keyword, query, collections)
  }

  if (query.prefix) {
    return await listSingleSetIcons(query.prefix, query)
  }

  return await listAllSetIcons(query, collections)
}
