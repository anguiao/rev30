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
import { formatIconCursor, parseIconCursor, type IconCursor } from '../cursor'

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

function getCursorPrefixIndex(prefixes: string[], cursor?: IconCursor) {
  if (!cursor) {
    return 0
  }

  const index = prefixes.indexOf(cursor.prefix)

  return index >= 0 ? index : 0
}

function getCursorNameIndex(names: string[], prefix: string, cursor?: IconCursor) {
  if (cursor?.prefix !== prefix) {
    return 0
  }

  const index = names.indexOf(cursor.name)

  return index >= 0 ? index + 1 : 0
}

function toCursorListResponse(collectedItems: IconSetIconItem[], pageSize: number) {
  const pageList = collectedItems.slice(0, pageSize)
  const lastItem = pageList.at(-1)

  return {
    list: pageList,
    nextCursor:
      collectedItems.length > pageSize && lastItem
        ? formatIconCursor(lastItem.prefix, lastItem.name)
        : null,
    pageSize,
  }
}

async function listSingleSetIcons(
  prefix: string,
  query: IconSetIconListQuery,
): Promise<BuiltinIconListResponse> {
  const iconSet = await lookupCollection(prefix)
  const names = Object.keys(iconSet.icons).sort((left, right) => left.localeCompare(right))
  const cursor = parseIconCursor(query.cursor)
  const startIndex = getCursorNameIndex(names, prefix, cursor)
  const list = names
    .slice(startIndex, startIndex + query.pageSize + 1)
    .map((name) => mapIconSetIconItem(iconSet, name))
    .filter((item): item is IconSetIconItem => item !== undefined)

  return toCursorListResponse(list, query.pageSize)
}

async function listAllSetIcons(
  query: IconSetIconListQuery,
  collections: IconCollections,
): Promise<BuiltinIconListResponse> {
  const list: IconSetIconItem[] = []
  const collectionEntries = Object.entries(collections)
  const cursor = parseIconCursor(query.cursor)
  const startPrefixIndex = getCursorPrefixIndex(
    collectionEntries.map(([prefix]) => prefix),
    cursor,
  )

  for (const [prefix] of collectionEntries.slice(startPrefixIndex)) {
    const iconSet = await lookupCollection(prefix)
    const names = Object.keys(iconSet.icons).sort((left, right) => left.localeCompare(right))
    const startNameIndex = getCursorNameIndex(names, prefix, cursor)

    for (let index = startNameIndex; index < names.length; index += 1) {
      const name = names[index]

      if (!name) {
        continue
      }

      const row = mapIconSetIconItem(iconSet, name)

      if (!row) {
        continue
      }

      list.push(row)

      if (list.length > query.pageSize) {
        return toCursorListResponse(list, query.pageSize)
      }
    }
  }

  return toCursorListResponse(list, query.pageSize)
}

async function searchIcons(
  keyword: string,
  query: IconSetIconListQuery,
  collections: IconCollections,
): Promise<BuiltinIconListResponse> {
  const prefixes = query.prefix ? [query.prefix] : Object.keys(collections)
  const list: IconSetIconItem[] = []
  const cursor = parseIconCursor(query.cursor)
  const startPrefixIndex = getCursorPrefixIndex(prefixes, cursor)

  for (const prefix of prefixes.slice(startPrefixIndex)) {
    const iconSet = await lookupCollection(prefix)
    const names = [
      ...new Set([...Object.keys(iconSet.icons), ...Object.keys(iconSet.aliases ?? {})]),
    ].sort((left, right) => left.localeCompare(right))

    const startNameIndex = getCursorNameIndex(names, prefix, cursor)

    for (let index = startNameIndex; index < names.length; index += 1) {
      const name = names[index]

      if (!name) {
        continue
      }

      const fullName = `${prefix}:${name}`

      if (!matchesKeyword(name, keyword) && !matchesKeyword(fullName, keyword)) {
        continue
      }

      const row = mapIconSetIconItem(iconSet, name)

      if (!row) {
        continue
      }

      list.push(row)

      if (list.length > query.pageSize) {
        return toCursorListResponse(list, query.pageSize)
      }
    }
  }

  return toCursorListResponse(list, query.pageSize)
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
      nextCursor: null,
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
