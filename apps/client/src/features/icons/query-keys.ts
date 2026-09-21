import { iconSearchQuerySchema } from '@rev30/contracts'
import { normalizeSearchText } from '@rev30/utils'

function keywordKey(keyword: string) {
  const result = iconSearchQuerySchema.safeParse({ keyword })

  return result.success ? ['valid', normalizeSearchText(result.data.keyword)] : ['invalid', keyword]
}

export function iconSearchKey(keyword: string, limit: number) {
  return ['system', 'icons', 'search', ...keywordKey(keyword), limit]
}

export function iconListKey(
  source: 'builtin' | 'custom',
  keyword: string,
  prefix: string | null,
  pageSize: number,
) {
  return ['content', 'icon-sets', source, 'icons', pageSize, ...keywordKey(keyword), prefix ?? '']
}
