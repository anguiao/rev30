import { normalizeSearchText } from '@rev30/utils'
import type { IconSearchQuery, IconSearchResponse } from '@rev30/contracts'
import type { Db } from '../../../db'
import { assertIconSearchAvailable } from './indexing/state'
import { recommendedIcons } from './recommended'
import { searchIconDocuments } from './repository'

export function createIconSearchService(database: Db) {
  return {
    async searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
      const keyword = normalizeSearchText(query.keyword)
      if (!keyword) return { list: recommendedIcons.slice(0, query.limit) }
      assertIconSearchAvailable()
      const result = await searchIconDocuments(database, { keyword, limit: query.limit })
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
