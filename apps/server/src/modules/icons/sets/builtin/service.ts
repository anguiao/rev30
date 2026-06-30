import { lookupCollection } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import type {
  BuiltinIconListResponse,
  BuiltinIconSetListResponse,
  IconSetIconListQuery,
  IconSetListQuery,
  IconSetRenderableIcon,
} from '@rev30/contracts'
import { getIconData } from '@iconify/utils'
import { loadIconCollections } from '../../search/collections'

function normalizeKeyword(keyword?: string) {
  return keyword?.toLowerCase()
}

function paginate<T>(list: T[], page: number, pageSize: number) {
  const offset = (page - 1) * pageSize

  return list.slice(offset, offset + pageSize)
}

function matchesKeyword(value: string, keyword?: string) {
  if (!keyword) {
    return true
  }

  return value.toLowerCase().includes(keyword)
}

async function loadBuiltinCollection(prefix: string): Promise<IconifyJSON | null> {
  try {
    return await lookupCollection(prefix)
  } catch {
    return null
  }
}

function listCollectionNames(iconSet: IconifyJSON) {
  return [...new Set([...Object.keys(iconSet.icons), ...Object.keys(iconSet.aliases ?? {})])].sort(
    (left, right) => left.localeCompare(right),
  )
}

function listRealIconNames(iconSet: IconifyJSON) {
  return Object.keys(iconSet.icons).sort((left, right) => left.localeCompare(right))
}

function mapRenderableIcon(prefix: string, setName: string, name: string, iconSet: IconifyJSON) {
  const icon = getIconData(iconSet, name)

  if (!icon?.body) {
    return undefined
  }

  const row: IconSetRenderableIcon = {
    icon: `${prefix}:${name}`,
    prefix,
    name,
    setName,
    body: icon.body,
    width: icon.width ?? iconSet.width ?? 16,
    height: icon.height ?? iconSet.height ?? 16,
  }

  return row
}

function getSortedCollectionEntries(collections: Awaited<ReturnType<typeof loadIconCollections>>) {
  return Object.entries(collections).sort(([left], [right]) => left.localeCompare(right))
}

async function listBuiltinIconsWithoutKeyword(
  query: IconSetIconListQuery,
  collections: Awaited<ReturnType<typeof loadIconCollections>>,
): Promise<BuiltinIconListResponse> {
  if (query.prefix) {
    const iconSet = await loadBuiltinCollection(query.prefix)

    if (!iconSet) {
      return {
        list: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
      }
    }

    const setName = collections[query.prefix]?.name ?? iconSet.info?.name ?? query.prefix
    const names = listCollectionNames(iconSet)
    const list = paginate(names, query.page, query.pageSize)
      .map((name) => mapRenderableIcon(query.prefix!, setName, name, iconSet))
      .filter((item): item is IconSetRenderableIcon => item !== undefined)

    return {
      list,
      total: names.length,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  const offset = (query.page - 1) * query.pageSize
  const list: IconSetRenderableIcon[] = []
  const collectionEntries = getSortedCollectionEntries(collections)
  const total = collectionEntries.reduce((sum, [, collection]) => sum + (collection.total ?? 0), 0)
  let skipped = offset

  for (const [prefix, collection] of collectionEntries) {
    const collectionTotal = collection.total ?? 0

    if (skipped >= collectionTotal) {
      skipped -= collectionTotal
      continue
    }

    const iconSet = await loadBuiltinCollection(prefix)

    if (!iconSet) {
      skipped = 0
      continue
    }

    const setName = collection.name ?? iconSet.info?.name ?? prefix
    const names = listRealIconNames(iconSet)

    for (let index = skipped; index < names.length; index += 1) {
      const name = names[index]

      if (!name) {
        continue
      }

      const row = mapRenderableIcon(prefix, setName, name, iconSet)

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

export async function listBuiltinIconSets(
  query: IconSetListQuery,
): Promise<BuiltinIconSetListResponse> {
  const collections = await loadIconCollections()
  const keyword = normalizeKeyword(query.keyword)
  const list = Object.entries(collections)
    .map(([prefix, collection]) => ({
      prefix,
      name: collection.name ?? prefix,
      total: collection.total ?? 0,
    }))
    .filter((item) => matchesKeyword(item.prefix, keyword) || matchesKeyword(item.name, keyword))
    .sort((left, right) => left.prefix.localeCompare(right.prefix))

  return {
    list,
    total: list.length,
  }
}

export async function listBuiltinIcons(
  query: IconSetIconListQuery,
): Promise<BuiltinIconListResponse> {
  const collections = await loadIconCollections()
  const keyword = normalizeKeyword(query.keyword)

  if (!keyword) {
    return await listBuiltinIconsWithoutKeyword(query, collections)
  }

  const prefixes = query.prefix
    ? collections[query.prefix]
      ? [query.prefix]
      : []
    : Object.keys(collections).sort((left, right) => left.localeCompare(right))
  const offset = (query.page - 1) * query.pageSize
  const list: IconSetRenderableIcon[] = []
  let total = 0

  for (const prefix of prefixes) {
    const iconSet = await loadBuiltinCollection(prefix)

    if (!iconSet) {
      continue
    }

    const setName = collections[prefix]?.name ?? iconSet.info?.name ?? prefix

    for (const name of listCollectionNames(iconSet)) {
      const fullName = `${prefix}:${name}`

      if (keyword && !matchesKeyword(name, keyword) && !matchesKeyword(fullName, keyword)) {
        continue
      }

      const row = mapRenderableIcon(prefix, setName, name, iconSet)

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
