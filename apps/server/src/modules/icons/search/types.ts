import type { AsyncFzf } from 'fzf'

export type SearchIndex = {
  all: number[]
  prefixIds: number[]
  prefixes: string[]
  names: string[]
  collectionIds: number[]
  collections: string[]
  palettes: boolean[]
  recommended: number[]
  tokenBuckets: Map<string, number[]>
  searchTokens: string[]
  preferredByPrefix: Map<string, Map<string, number>>
  fastFinder: AsyncFzf<number[]>
  extendedFinder: AsyncFzf<number[]>
}

export type ExpandedSearch = {
  normalizedKeyword: string
  candidates: string[]
  tokens: string[]
  aliasTokens: Set<string>
}
