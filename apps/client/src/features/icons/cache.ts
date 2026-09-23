import type { QueryCache } from '@pinia/colada'
import { iconSearchQuerySchema } from '@rev30/contracts'
import { normalizeSearchText } from '@rev30/utils'

export function iconSearchKeywordKey(keyword: string) {
  const result = iconSearchQuerySchema.safeParse({ keyword })

  return result.success ? ['valid', normalizeSearchText(result.data.keyword)] : ['invalid', keyword]
}

export async function refreshCustomIconCaches(queryCache: QueryCache) {
  await Promise.allSettled([
    queryCache.invalidateQueries({ key: ['content', 'icon-sets', 'custom'] }),
    queryCache.invalidateQueries({ key: ['system', 'icons', 'search'] }),
  ])
}
