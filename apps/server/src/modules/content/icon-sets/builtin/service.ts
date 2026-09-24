import { normalizeSearchText } from '@rev30/utils'
import { lookupCollection } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import type {
  BuiltinIconListResponse,
  BuiltinIconSetListResponse,
  IconSetIconItem,
  IconSetIconListQuery,
  IconSetListQuery,
} from '@rev30/contracts'
import { getIconData, iconToSVG, wrapSVGContent } from '@iconify/utils'
import type { Db } from '../../../../db'
import {
  ICON_PACKAGE_VERSION,
  getBuiltinIconSubset,
  loadIconCollections,
} from '../../../icons/builtin'
import { searchIconDocuments } from '../../../icons/search/repository'
import { assertIconSearchAvailable } from '../../../icons/search/indexing/state'
import { formatIconBrowseCursor, parseIconBrowseCursor } from '../../../icons/cursor'

function mapIcon(
  iconSet: IconifyJSON,
  name: string,
  setName = iconSet.info?.name ?? iconSet.prefix,
): IconSetIconItem | undefined {
  const icon = getIconData(iconSet, name)
  if (icon === null) return undefined
  const rendered = iconToSVG(icon)
  const [left, top, width, height] = rendered.viewBox
  const body =
    left === 0 && top === 0
      ? rendered.body
      : wrapSVGContent(rendered.body, `<g transform="translate(${-left} ${-top})">`, '</g>')
  return {
    icon: `${iconSet.prefix}:${name}`,
    prefix: iconSet.prefix,
    name,
    setName,
    body,
    width,
    height,
  }
}

export async function browseBuiltinIcons(
  query: IconSetIconListQuery,
): Promise<BuiltinIconListResponse> {
  const collections = await loadIconCollections()
  const cursorOptions = {
    source: 'builtin' as const,
    ...(query.prefix ? { prefix: query.prefix } : {}),
    dataVersion: ICON_PACKAGE_VERSION,
  }
  const afterId = parseIconBrowseCursor(query.cursor, cursorOptions)
  if (query.prefix && !collections[query.prefix])
    return { list: [], nextCursor: null, pageSize: query.pageSize }
  const prefixes = (query.prefix ? [query.prefix] : Object.keys(collections)).sort((a, b) => {
    if (a === b) return 0
    return `${a}:` < `${b}:` ? -1 : 1
  })
  const collected: IconSetIconItem[] = []
  for (const prefix of prefixes) {
    if (afterId && !afterId.startsWith(`${prefix}:`) && `${prefix}:` < afterId) continue
    const iconSet = await lookupCollection(prefix)
    for (const name of Object.keys(iconSet.icons).sort()) {
      const id = `${prefix}:${name}`
      if (afterId && id <= afterId) continue
      const item = mapIcon(iconSet, name)
      if (item) collected.push(item)
      if (collected.length > query.pageSize) break
    }
    if (collected.length > query.pageSize) break
  }
  const list = collected.slice(0, query.pageSize)
  const last = list.at(-1)
  return {
    list,
    nextCursor:
      collected.length > query.pageSize && last
        ? formatIconBrowseCursor(cursorOptions, { id: last.icon })
        : null,
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
    .filter(
      (item) =>
        !keyword ||
        item.prefix.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword),
    )
  return { list, total: list.length }
}

export async function listBuiltinIcons(
  query: IconSetIconListQuery,
  database: Db,
): Promise<BuiltinIconListResponse> {
  const keyword = normalizeSearchText(query.keyword ?? '')
  if (!keyword) return browseBuiltinIcons(query)

  assertIconSearchAvailable()
  const result = await searchIconDocuments(database, {
    keyword,
    source: 'builtin',
    ...(query.prefix ? { prefix: query.prefix } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    limit: query.pageSize,
  })
  const namesByPrefix = new Map<string, string[]>()
  for (const row of result.rows) {
    const names = namesByPrefix.get(row.prefix) ?? []
    names.push(row.name)
    namesByPrefix.set(row.prefix, names)
  }
  const subsets = new Map<string, IconifyJSON>()
  for (const [prefix, names] of namesByPrefix) {
    const subset = await getBuiltinIconSubset(prefix, names)
    if (subset) subsets.set(prefix, subset)
  }
  const list = result.rows.flatMap((row) => {
    const subset = subsets.get(row.prefix)
    return subset ? (mapIcon(subset, row.name, row.collection) ?? []) : []
  })
  return { list, nextCursor: result.nextCursor, pageSize: query.pageSize }
}
