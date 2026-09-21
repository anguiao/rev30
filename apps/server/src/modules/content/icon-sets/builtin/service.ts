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
import { createRequire as createPackageRequire } from 'node:module'
import type { Db } from '../../../../db'
import { type IconCollections, loadIconCollections } from '../../../icons/search/collections'
import { searchIconDocuments } from '../../../icons/search/query-repository'
import { assertIconSearchAvailable } from '../../../icons/search/lifecycle'
import { getBuiltinIconSubset } from '../../../icons/service'
import { formatIconCursor, parseIconCursor } from '../../../icons/cursor'

const packageRequire = createPackageRequire(import.meta.url)
function iconPackageVersion() {
  return (packageRequire('@iconify/json/package.json') as { version: string }).version
}
function compareBytes(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function mapIcon(iconSet: IconifyJSON, name: string): IconSetIconItem | undefined {
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
    setName: iconSet.info?.name ?? '',
    body,
    width,
    height,
  }
}

function binding(query: IconSetIconListQuery) {
  return {
    mode: 'browse' as const,
    query: '',
    source: 'builtin' as const,
    ...(query.prefix ? { prefix: query.prefix } : {}),
    dataVersion: iconPackageVersion(),
  }
}

async function browse(
  query: IconSetIconListQuery,
  collections: IconCollections,
): Promise<BuiltinIconListResponse> {
  const cursor = parseIconCursor(query.cursor, binding(query))
  const afterId = cursor && 'id' in cursor ? cursor.id : undefined
  const prefixes = (query.prefix ? [query.prefix] : Object.keys(collections)).sort((a, b) =>
    compareBytes(`${a}:`, `${b}:`),
  )
  const collected: IconSetIconItem[] = []
  for (const prefix of prefixes) {
    if (afterId && !afterId.startsWith(`${prefix}:`) && compareBytes(`${prefix}:`, afterId) < 0)
      continue
    const iconSet = await lookupCollection(prefix)
    for (const name of Object.keys(iconSet.icons).sort(compareBytes)) {
      const id = `${prefix}:${name}`
      if (afterId && compareBytes(id, afterId) <= 0) continue
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
        ? formatIconCursor(binding(query), { id: last.icon })
        : null,
    pageSize: query.pageSize,
  }
}

async function search(query: IconSetIconListQuery, database: Db): Promise<BuiltinIconListResponse> {
  assertIconSearchAvailable(database)
  const result = await searchIconDocuments(database, {
    query: query.keyword!,
    source: 'builtin',
    ...(query.prefix ? { prefix: query.prefix } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    limit: query.pageSize,
  })
  const items = new Map<string, IconSetIconItem>()
  const collectionsById = new Map(result.rows.map((row) => [row.id, row.collection]))
  const namesByPrefix = new Map<string, string[]>()
  for (const row of result.rows)
    namesByPrefix.set(row.prefix, [...(namesByPrefix.get(row.prefix) ?? []), row.name])
  for (const [prefix, names] of namesByPrefix) {
    const subset = await getBuiltinIconSubset(prefix, names)
    if (!subset) continue
    for (const name of names) {
      const item = mapIcon(subset, name)
      if (item) {
        items.set(item.icon, { ...item, setName: collectionsById.get(item.icon) ?? prefix })
      }
    }
  }
  const list = result.rows.flatMap((row) => items.get(row.id) ?? [])
  return { list, nextCursor: result.nextCursor, pageSize: query.pageSize }
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

export async function browseBuiltinIcons(
  query: IconSetIconListQuery,
): Promise<BuiltinIconListResponse> {
  const collections = await loadIconCollections()
  parseIconCursor(query.cursor, binding(query))
  if (query.prefix && !collections[query.prefix])
    return { list: [], nextCursor: null, pageSize: query.pageSize }
  return browse(query, collections)
}

export async function listBuiltinIcons(
  query: IconSetIconListQuery,
  database: Db,
): Promise<BuiltinIconListResponse> {
  const keyword = normalizeSearchText(query.keyword ?? '')
  if (!keyword) return browseBuiltinIcons({ ...query, keyword: '' })
  return search({ ...query, keyword }, database)
}
