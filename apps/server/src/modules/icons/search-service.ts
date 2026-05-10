import type { IconSearchItem, IconSearchQuery, IconSearchResponse } from '@rev30/shared'
import { lookupCollection, lookupCollections } from '@iconify/json'
import { AsyncFzf, asyncExtendedMatch, byLengthAsc, byStartAsc } from 'fzf'
import {
  chineseIconSearchAliases,
  deprioritizedIconPrefixes,
  iconSearchAliasGroups,
  preferredIconPrefixes,
  recommendedIconNames,
} from './search-config'

type SearchIndexItem = IconSearchItem & {
  category: string
  searchText: string
}

type SearchIndex = {
  byIcon: Map<string, SearchIndexItem>
  all: SearchIndexItem[]
  recommended: SearchIndexItem[]
  tokenBuckets: Map<string, SearchIndexItem[]>
  searchTokens: string[]
  fastFinder: AsyncFzf<SearchIndexItem[]>
  extendedFinder: AsyncFzf<SearchIndexItem[]>
}

type ExpandedSearch = {
  normalizedKeyword: string
  candidates: string[]
  tokens: string[]
  aliasTokens: Set<string>
}

let searchIndexPromise: Promise<SearchIndex> | null = null
const minimumFuzzyCandidateLength = 3
const searchTokenPattern = /[a-z0-9]+(?:-[a-z0-9]+)*/g
const fuzzyCandidatePattern = /^[a-z0-9-]+$/

function toResponseItem(item: SearchIndexItem): IconSearchItem {
  return {
    icon: item.icon,
    prefix: item.prefix,
    name: item.name,
    collection: item.collection,
    palette: item.palette,
  }
}

function addPluralVariants(value: string, values: Set<string>) {
  if (value.length <= 1) {
    return
  }

  if (value.endsWith('ies') && value.length > 3) {
    values.add(`${value.slice(0, -3)}y`)
  } else if (value.endsWith('y')) {
    values.add(`${value.slice(0, -1)}ies`)
  }

  if (value.endsWith('s')) {
    values.add(value.slice(0, -1))
  } else {
    values.add(`${value}s`)
  }
}

function expandSearchCandidates(keyword: string): ExpandedSearch {
  const normalizedKeyword = keyword.trim().toLowerCase()
  const candidates = new Set<string>()
  const tokens = new Set<string>()
  const aliasTokens = new Set<string>()
  const englishTokens = normalizedKeyword.match(/[a-z0-9:-]+/g) ?? []

  if (normalizedKeyword) {
    candidates.add(normalizedKeyword)
  }

  for (const token of englishTokens) {
    tokens.add(token)
    candidates.add(token)
    addPluralVariants(token, candidates)
  }

  for (const group of iconSearchAliasGroups) {
    if (!group.some((token) => tokens.has(token))) {
      continue
    }

    for (const alias of group) {
      candidates.add(alias)
      aliasTokens.add(alias)
      addPluralVariants(alias, candidates)
    }
  }

  for (const [chinese, aliases] of Object.entries(chineseIconSearchAliases)) {
    if (!keyword.includes(chinese)) {
      continue
    }

    for (const alias of aliases) {
      candidates.add(alias)
      aliasTokens.add(alias)
      addPluralVariants(alias, candidates)
    }
  }

  return {
    normalizedKeyword,
    candidates: [...candidates].filter((candidate) => candidate.length > 0),
    tokens: [...tokens],
    aliasTokens,
  }
}

function scoreSearchItem(item: SearchIndexItem, search: ExpandedSearch): number {
  let score = 0
  const hasDirectTokens = search.tokens.length > 0
  const preferredAliasExactScore = hasDirectTokens ? 450 : 5000
  const aliasExactScore = hasDirectTokens ? 350 : 3000
  const aliasPrefixScore = hasDirectTokens ? 120 : 520
  const aliasContainsScore = hasDirectTokens ? 20 : 60

  for (const aliasToken of search.aliasTokens) {
    if (aliasToken === search.normalizedKeyword) {
      continue
    }

    for (const prefix of preferredIconPrefixes.keys()) {
      if (item.icon === `${prefix}:${aliasToken}`) {
        score += preferredAliasExactScore
      }
    }
  }

  if (item.icon === search.normalizedKeyword) {
    score += 12000
  }

  if (item.name === search.normalizedKeyword) {
    score += 10000
  }

  for (const token of search.tokens) {
    if (item.name === token) {
      score += 6000
      continue
    }

    if (item.name.startsWith(token)) {
      score += 1400
      continue
    }

    if (item.name.includes(token)) {
      score += 700
      continue
    }

    if (item.prefix.startsWith(token)) {
      score += 150
      continue
    }

    if (item.icon.includes(token)) {
      score += 120
    }
  }

  for (const aliasToken of search.aliasTokens) {
    if (aliasToken !== search.normalizedKeyword && item.name === aliasToken) {
      score += aliasExactScore
      continue
    }

    if (aliasToken !== search.normalizedKeyword && item.name.startsWith(`${aliasToken}-`)) {
      score += aliasPrefixScore
      continue
    }

    if (item.searchText.includes(aliasToken)) {
      score += aliasContainsScore
    }
  }

  score += preferredIconPrefixes.get(item.prefix) ?? 0

  if (!item.palette) {
    score += 24
  } else {
    score -= 12
  }

  if (deprioritizedIconPrefixes.has(item.prefix)) {
    score -= 36
  }

  return score
}

function getSearchTokens(item: SearchIndexItem): string[] {
  const tokens = new Set<string>([item.icon, item.prefix, item.name])

  for (const value of [item.name, item.collection, item.category]) {
    for (const token of value.toLowerCase().match(searchTokenPattern) ?? []) {
      tokens.add(token)

      for (const part of token.split('-')) {
        if (part) {
          tokens.add(part)
        }
      }
    }
  }

  return [...tokens]
}

function addItemToTokenBuckets(tokenBuckets: Map<string, SearchIndexItem[]>, item: SearchIndexItem) {
  for (const token of getSearchTokens(item)) {
    const bucket = tokenBuckets.get(token)

    if (bucket) {
      bucket.push(item)
      continue
    }

    tokenBuckets.set(token, [item])
  }
}

function matchesCharactersInOrder(value: string, keyword: string): boolean {
  let keywordIndex = 0

  for (const character of value) {
    if (character !== keyword[keywordIndex]) {
      continue
    }

    keywordIndex += 1

    if (keywordIndex === keyword.length) {
      return true
    }
  }

  return false
}

function collectRecallPool(index: SearchIndex, search: ExpandedSearch): SearchIndexItem[] {
  const uniqueItems = new Map<string, SearchIndexItem>()
  const matchedTokens = new Set<string>()

  for (const candidate of search.candidates) {
    const exactItem = index.byIcon.get(candidate)
    const exactTokenBucket = index.tokenBuckets.get(candidate)
    let matchedLiteralToken = false

    if (exactItem) {
      uniqueItems.set(exactItem.icon, exactItem)
    }

    if (exactTokenBucket) {
      matchedTokens.add(candidate)

      for (const item of exactTokenBucket) {
        if (!uniqueItems.has(item.icon)) {
          uniqueItems.set(item.icon, item)
        }
      }

      continue
    }

    for (const token of index.searchTokens) {
      if (matchedTokens.has(token)) {
        continue
      }

      if (!token.includes(candidate)) {
        continue
      }

      matchedLiteralToken = true
      matchedTokens.add(token)

      for (const item of index.tokenBuckets.get(token) ?? []) {
        if (!uniqueItems.has(item.icon)) {
          uniqueItems.set(item.icon, item)
        }
      }
    }

    if (
      matchedLiteralToken
      || candidate.length < minimumFuzzyCandidateLength
      || !fuzzyCandidatePattern.test(candidate)
    ) {
      continue
    }

    for (const token of index.searchTokens) {
      if (matchedTokens.has(token) || !matchesCharactersInOrder(token, candidate)) {
        continue
      }

      matchedTokens.add(token)

      for (const item of index.tokenBuckets.get(token) ?? []) {
        if (!uniqueItems.has(item.icon)) {
          uniqueItems.set(item.icon, item)
        }
      }
    }
  }

  return [...uniqueItems.values()]
}

async function buildSearchIndex(): Promise<SearchIndex> {
  const collections = await lookupCollections()
  const byIcon = new Map<string, SearchIndexItem>()
  const all: SearchIndexItem[] = []
  const tokenBuckets = new Map<string, SearchIndexItem[]>()

  for (const [prefix, collectionInfo] of Object.entries(collections)) {
    const iconSet = await lookupCollection(prefix)
    const collection = collectionInfo.name.trim() || prefix
    const category = collectionInfo.category?.trim() ?? ''
    const palette = Boolean(collectionInfo.palette)
    const names = new Set<string>([...Object.keys(iconSet.icons), ...Object.keys(iconSet.aliases ?? {})])

    for (const name of names) {
      const icon = `${prefix}:${name}`

      if (byIcon.has(icon)) {
        continue
      }

      const searchText = `${icon} ${prefix} ${name} ${collection} ${category}`.toLowerCase()
      const item: SearchIndexItem = {
        icon,
        prefix,
        name,
        collection,
        palette,
        category,
        searchText,
      }

      byIcon.set(icon, item)
      all.push(item)
      addItemToTokenBuckets(tokenBuckets, item)
    }
  }

  const recommended = recommendedIconNames
    .map((iconName) => byIcon.get(iconName))
    .filter((item): item is SearchIndexItem => Boolean(item))

  const fzfLimit = Math.min(all.length, 400)
  const baseOptions = {
    selector: (item: SearchIndexItem) => item.searchText,
    tiebreakers: [byStartAsc, byLengthAsc],
    limit: fzfLimit,
  }

  return {
    byIcon,
    all,
    recommended,
    tokenBuckets,
    searchTokens: [...tokenBuckets.keys()],
    fastFinder: new AsyncFzf(all, baseOptions),
    extendedFinder: new AsyncFzf(all, {
      ...baseOptions,
      match: asyncExtendedMatch,
    }),
  }
}

async function getSearchIndex(): Promise<SearchIndex> {
  if (!searchIndexPromise) {
    searchIndexPromise = buildSearchIndex().catch((error) => {
      searchIndexPromise = null
      throw error
    })
  }

  return searchIndexPromise
}

async function recallCandidates(index: SearchIndex, search: ExpandedSearch, limit: number): Promise<SearchIndexItem[]> {
  if (search.candidates.length === 0) {
    return []
  }

  const recallPool = collectRecallPool(index, search)
  const finderOptions = {
    selector: (item: SearchIndexItem) => item.searchText,
    tiebreakers: [byStartAsc, byLengthAsc],
    limit: Math.max(limit * 4, 60),
  }
  const fastFinder = recallPool.length === index.all.length ? index.fastFinder : new AsyncFzf(recallPool, finderOptions)
  const extendedFinder =
    recallPool.length === index.all.length
      ? index.extendedFinder
      : new AsyncFzf(recallPool, {
          ...finderOptions,
          match: asyncExtendedMatch,
        })
  const foundItems =
    search.candidates.length === 1
      ? await fastFinder.find(search.candidates[0]!)
      : await extendedFinder.find(search.candidates.join(' | '))
  const uniqueItems = new Map<string, SearchIndexItem>()

  for (const entry of foundItems) {
    if (uniqueItems.has(entry.item.icon)) {
      continue
    }

    uniqueItems.set(entry.item.icon, entry.item)
  }

  const exactItem = index.byIcon.get(search.normalizedKeyword)

  if (exactItem && !uniqueItems.has(exactItem.icon)) {
    uniqueItems.set(exactItem.icon, exactItem)
  }

  if (search.aliasTokens.size > 0) {
    for (const aliasToken of search.aliasTokens) {
      for (const prefix of preferredIconPrefixes.keys()) {
        const item = index.byIcon.get(`${prefix}:${aliasToken}`)

        if (item && !uniqueItems.has(item.icon)) {
          uniqueItems.set(item.icon, item)
        }
      }
    }
  }

  return [...uniqueItems.values()]
}

export async function searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
  const index = await getSearchIndex()
  const keyword = query.keyword.trim()

  if (!keyword) {
    return {
      list: index.recommended.slice(0, query.limit).map(toResponseItem),
    }
  }

  const search = expandSearchCandidates(keyword)
  const recalled = await recallCandidates(index, search, query.limit)
  const ranked = recalled
    .map((item, indexOrder) => ({
      item,
      score: scoreSearchItem(item, search),
      indexOrder,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.indexOrder - right.indexOrder
    })
    .slice(0, query.limit)
    .map(({ item }) => toResponseItem(item))

  return { list: ranked }
}
