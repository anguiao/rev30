import { normalizeSearchText } from '@rev30/utils'
import type { IconSearchItem, IconSearchQuery, IconSearchResponse } from '@rev30/contracts'
import type { Db } from '../../../db'
import { getBuiltinIconSubset } from '../service'
import { loadIconCollections } from './collections'
import { recommendedIconNames } from './config'
import { assertIconSearchAvailable } from './lifecycle'
import { searchIconDocuments } from './query-repository'

async function recommendedIcons(limit: number): Promise<IconSearchItem[]> {
  const collections = await loadIconCollections()
  const namesByPrefix = new Map<string, string[]>()
  const available = new Set<string>()
  for (const id of recommendedIconNames) {
    const [prefix, name] = id.split(':') as [string, string]
    if (collections[prefix]) {
      namesByPrefix.set(prefix, [...(namesByPrefix.get(prefix) ?? []), name])
    }
  }
  for (const [prefix, names] of namesByPrefix) {
    const subset = await getBuiltinIconSubset(prefix, names)
    if (!subset) continue
    for (const name of names) {
      if (!subset.not_found?.includes(name) && (subset.icons[name] || subset.aliases?.[name])) {
        available.add(`${prefix}:${name}`)
      }
    }
  }
  return recommendedIconNames
    .flatMap((id) => {
      if (!available.has(id)) return []
      const [prefix, name] = id.split(':') as [string, string]
      const collection = collections[prefix]!
      return [
        {
          icon: id,
          prefix,
          name,
          collection: collection.name.trim() || prefix,
          palette: Boolean(collection.palette),
        },
      ]
    })
    .slice(0, limit)
}

export function createIconSearchService(database: Db) {
  return {
    async searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
      const keyword = normalizeSearchText(query.keyword)
      if (!keyword) return { list: await recommendedIcons(query.limit) }
      assertIconSearchAvailable(database)
      const result = await searchIconDocuments(database, { query: keyword, limit: query.limit })
      return {
        list: result.rows.map((row) => ({
          icon: row.id,
          prefix: row.prefix,
          name: row.name,
          collection: row.collection,
          palette: row.palette,
        })),
      }
    },
  }
}
