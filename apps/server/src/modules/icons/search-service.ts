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
import { getIconSubset } from './service'

type SearchIndex = {
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

type ExpandedSearch = {
  normalizedKeyword: string
  candidates: string[]
  tokens: string[]
  aliasTokens: Set<string>
}

type IconCollections = Awaited<ReturnType<typeof lookupCollections>>

let searchIndexPromise: Promise<SearchIndex> | null = null
let searchIndexEvictionTimer: ReturnType<typeof setTimeout> | null = null
let searchIndexEvictionPromise: Promise<SearchIndex> | null = null
let iconCollectionsPromise: Promise<IconCollections> | null = null
const maxSearchCandidateCount = 12
const minimumFuzzyCandidateLength = 3
const defaultSearchIndexIdleTtlMs = 15 * 60 * 1000
const maxSearchIndexIdleTtlMs = 2_147_483_647
const exactIconSearchPattern = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/
const searchTokenPattern = /[a-z0-9]+(?:-[a-z0-9]+)*/g
const fuzzyCandidatePattern = /^[a-z0-9-]+$/
const searchIndexIdleTtlMs = readSearchIndexIdleTtlMs()
const recommendedIconNameIndexes = new Map(
  recommendedIconNames.map((iconName, index) => [iconName, index]),
)

function readSearchIndexIdleTtlMs(): number {
  const value = Number(process.env.ICON_SEARCH_INDEX_IDLE_TTL_MS ?? defaultSearchIndexIdleTtlMs)

  if (!Number.isInteger(value) || value > maxSearchIndexIdleTtlMs) {
    throw new Error(
      `ICON_SEARCH_INDEX_IDLE_TTL_MS 必须是整数，且不能超过 ${maxSearchIndexIdleTtlMs}`,
    )
  }

  return value
}

function getPrefix(index: SearchIndex, id: number): string {
  return index.prefixes[index.prefixIds[id]!]!
}

function getCollection(index: SearchIndex, id: number): string {
  return index.collections[index.collectionIds[id]!]!
}

function toIconName(index: SearchIndex, id: number): string {
  return `${getPrefix(index, id)}:${index.names[id]}`
}

function toResponseItem(index: SearchIndex, id: number): IconSearchItem {
  return {
    icon: toIconName(index, id),
    prefix: getPrefix(index, id),
    name: index.names[id]!,
    collection: getCollection(index, id),
    palette: index.palettes[id]!,
  }
}

function addPluralVariants(value: string, addValue: (value: string) => boolean) {
  if (value.length <= 1) {
    return
  }

  if (value.endsWith('ies') && value.length > 3) {
    addValue(`${value.slice(0, -3)}y`)
  } else if (value.endsWith('y')) {
    addValue(`${value.slice(0, -1)}ies`)
  }

  if (value.endsWith('s')) {
    addValue(value.slice(0, -1))
  } else {
    addValue(`${value}s`)
  }
}

async function loadIconCollections(): Promise<IconCollections> {
  if (!iconCollectionsPromise) {
    iconCollectionsPromise = lookupCollections().catch((error) => {
      iconCollectionsPromise = null
      throw error
    })
  }

  return iconCollectionsPromise
}

async function resolveExactIconSearch(keyword: string): Promise<IconSearchItem[] | null> {
  const exactIcon = keyword.toLowerCase().match(exactIconSearchPattern)

  if (!exactIcon) {
    return null
  }

  const prefix = exactIcon[1]!
  const name = exactIcon[2]!
  const collections = await loadIconCollections()
  const collectionInfo = collections[prefix]

  if (!collectionInfo) {
    return []
  }

  const subset = await getIconSubset(prefix, [name])

  if (!subset || subset.not_found?.includes(name)) {
    return []
  }

  if (!subset.icons[name] && !subset.aliases?.[name]) {
    return []
  }

  return [
    {
      icon: `${prefix}:${name}`,
      prefix,
      name,
      collection: collectionInfo.name.trim() || prefix,
      palette: Boolean(collectionInfo.palette),
    },
  ]
}

function expandSearchCandidates(keyword: string): ExpandedSearch {
  const normalizedKeyword = keyword.trim().toLowerCase()
  const candidates = new Set<string>()
  const tokens = new Set<string>()
  const aliasTokens = new Set<string>()
  const englishTokens = normalizedKeyword.match(/[a-z0-9:-]+/g) ?? []
  const addCandidate = (value: string, options: { alias?: boolean } = {}) => {
    const candidate = value.trim()

    if (!candidate) {
      return false
    }

    if (candidates.has(candidate)) {
      if (options.alias) {
        aliasTokens.add(candidate)
      }

      return true
    }

    if (candidates.size >= maxSearchCandidateCount) {
      return false
    }

    candidates.add(candidate)

    if (options.alias) {
      aliasTokens.add(candidate)
    }

    return true
  }
  const addCandidateWithVariants = (value: string, options: { alias?: boolean } = {}) => {
    const added = addCandidate(value, options)

    if (!added && !candidates.has(value)) {
      return
    }

    addPluralVariants(value, (variant) => addCandidate(variant, options))
  }

  if (normalizedKeyword) {
    addCandidate(normalizedKeyword)
  }

  for (const token of englishTokens) {
    tokens.add(token)
    addCandidateWithVariants(token)
  }

  for (const group of iconSearchAliasGroups) {
    if (!group.some((token) => tokens.has(token))) {
      continue
    }

    for (const alias of group) {
      addCandidateWithVariants(alias, { alias: true })
    }
  }

  for (const [chinese, aliases] of Object.entries(chineseIconSearchAliases)) {
    if (!keyword.includes(chinese)) {
      continue
    }

    for (const alias of aliases) {
      addCandidateWithVariants(alias, { alias: true })
    }
  }

  return {
    normalizedKeyword,
    candidates: [...candidates].filter((candidate) => candidate.length > 0),
    tokens: [...tokens],
    aliasTokens,
  }
}

function scoreSearchItem(index: SearchIndex, id: number, search: ExpandedSearch): number {
  let score = 0
  const prefix = getPrefix(index, id)
  const name = index.names[id]!
  const palette = index.palettes[id]!
  const hasDirectTokens = search.tokens.length > 0
  const preferredAliasExactScore = hasDirectTokens ? 450 : 5000
  const aliasExactScore = hasDirectTokens ? 350 : 3000
  const aliasPrefixScore = hasDirectTokens ? 120 : 520
  const aliasContainsScore = hasDirectTokens ? 20 : 60

  for (const aliasToken of search.aliasTokens) {
    if (aliasToken === search.normalizedKeyword) {
      continue
    }

    if (preferredIconPrefixes.has(prefix) && name === aliasToken) {
      score += preferredAliasExactScore
    }
  }

  if (name === search.normalizedKeyword) {
    score += 10000
  }

  for (const token of search.tokens) {
    if (name === token) {
      score += 6000
      continue
    }

    if (name.startsWith(token)) {
      score += 1400
      continue
    }

    if (name.includes(token)) {
      score += 700
      continue
    }

    if (prefix.startsWith(token)) {
      score += 150
      continue
    }

    if (prefix.includes(token)) {
      score += 120
    }
  }

  for (const aliasToken of search.aliasTokens) {
    if (aliasToken !== search.normalizedKeyword && name === aliasToken) {
      score += aliasExactScore
      continue
    }

    if (aliasToken !== search.normalizedKeyword && name.startsWith(`${aliasToken}-`)) {
      score += aliasPrefixScore
      continue
    }

    if (name.includes(aliasToken)) {
      score += aliasContainsScore
    }
  }

  score += preferredIconPrefixes.get(prefix) ?? 0

  if (!palette) {
    score += 24
  } else {
    score -= 12
  }

  if (deprioritizedIconPrefixes.has(prefix)) {
    score -= 36
  }

  return score
}

function getSearchTokens(prefix: string, name: string): string[] {
  const tokens = new Set<string>([prefix, name])

  for (const token of name.toLowerCase().match(searchTokenPattern) ?? []) {
    tokens.add(token)

    for (const part of token.split('-')) {
      if (part) {
        tokens.add(part)
      }
    }
  }

  return [...tokens]
}

function addItemToTokenBuckets(
  tokenBuckets: Map<string, number[]>,
  id: number,
  prefix: string,
  name: string,
) {
  for (const token of getSearchTokens(prefix, name)) {
    const bucket = tokenBuckets.get(token)

    if (bucket) {
      bucket.push(id)
      continue
    }

    tokenBuckets.set(token, [id])
  }
}

function addIds(target: Set<number>, ids: readonly number[] | undefined) {
  if (!ids) {
    return
  }

  for (const id of ids) {
    target.add(id)
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

function collectRecallPool(index: SearchIndex, search: ExpandedSearch): number[] {
  const uniqueItems = new Set<number>()
  const matchedTokens = new Set<string>()

  for (const candidate of search.candidates) {
    const exactTokenBucket = index.tokenBuckets.get(candidate)
    let matchedLiteralToken = false

    if (exactTokenBucket) {
      matchedTokens.add(candidate)
      addIds(uniqueItems, exactTokenBucket)

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
      addIds(uniqueItems, index.tokenBuckets.get(token))
    }

    if (
      matchedLiteralToken ||
      candidate.length < minimumFuzzyCandidateLength ||
      !fuzzyCandidatePattern.test(candidate)
    ) {
      continue
    }

    for (const token of index.searchTokens) {
      if (matchedTokens.has(token) || !matchesCharactersInOrder(token, candidate)) {
        continue
      }

      matchedTokens.add(token)
      addIds(uniqueItems, index.tokenBuckets.get(token))
    }
  }

  return [...uniqueItems]
}

async function buildSearchIndex(): Promise<SearchIndex> {
  const collections = await loadIconCollections()
  const all: number[] = []
  const prefixIds: number[] = []
  const prefixes: string[] = []
  const prefixIndexes = new Map<string, number>()
  const itemNames: string[] = []
  const collectionIds: number[] = []
  const itemCollections: string[] = []
  const collectionIndexes = new Map<string, number>()
  const palettes: boolean[] = []
  const recommendedItems = new Array<number | null>(recommendedIconNames.length).fill(null)
  const tokenBuckets = new Map<string, number[]>()
  const preferredByPrefix = new Map<string, Map<string, number>>()

  for (const [prefix, collectionInfo] of Object.entries(collections)) {
    const iconSet = await lookupCollection(prefix)
    const collection = collectionInfo.name.trim() || prefix
    const palette = Boolean(collectionInfo.palette)
    let prefixId = prefixIndexes.get(prefix)
    let collectionId = collectionIndexes.get(collection)
    const names = new Set<string>([
      ...Object.keys(iconSet.icons),
      ...Object.keys(iconSet.aliases ?? {}),
    ])

    if (prefixId === undefined) {
      prefixId = prefixes.length
      prefixIndexes.set(prefix, prefixId)
      prefixes.push(prefix)
    }

    if (collectionId === undefined) {
      collectionId = itemCollections.length
      collectionIndexes.set(collection, collectionId)
      itemCollections.push(collection)
    }

    for (const name of names) {
      const id = itemNames.length
      prefixIds.push(prefixId)
      itemNames.push(name)
      collectionIds.push(collectionId)
      palettes.push(palette)
      all.push(id)
      addItemToTokenBuckets(tokenBuckets, id, prefix, name)

      const recommendedIndex = recommendedIconNameIndexes.get(`${prefix}:${name}`)

      if (recommendedIndex !== undefined) {
        recommendedItems[recommendedIndex] = id
      }

      if (preferredIconPrefixes.has(prefix)) {
        const prefixItems = preferredByPrefix.get(prefix)

        if (prefixItems) {
          prefixItems.set(name, id)
        } else {
          preferredByPrefix.set(prefix, new Map([[name, id]]))
        }
      }
    }
  }

  const recommended = recommendedItems.filter((id): id is number => id !== null)

  const fzfLimit = Math.min(all.length, 400)
  const baseOptions = {
    selector: (id: number) => itemNames[id]!,
    tiebreakers: [byStartAsc, byLengthAsc],
    limit: fzfLimit,
  }

  return {
    all,
    prefixIds,
    prefixes,
    names: itemNames,
    collectionIds,
    collections: itemCollections,
    palettes,
    recommended,
    tokenBuckets,
    searchTokens: [...tokenBuckets.keys()],
    preferredByPrefix,
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

  const indexPromise = searchIndexPromise
  const index = await indexPromise
  refreshSearchIndexEviction(indexPromise)

  return index
}

function refreshSearchIndexEviction(indexPromise: Promise<SearchIndex>) {
  if (searchIndexIdleTtlMs <= 0) {
    return
  }

  if (searchIndexEvictionTimer && searchIndexEvictionPromise === indexPromise) {
    searchIndexEvictionTimer.refresh()
    return
  }

  if (searchIndexEvictionTimer) {
    clearTimeout(searchIndexEvictionTimer)
  }

  searchIndexEvictionPromise = indexPromise
  searchIndexEvictionTimer = setTimeout(() => {
    if (searchIndexPromise === indexPromise) {
      searchIndexPromise = null
    }

    if (searchIndexEvictionPromise === indexPromise) {
      searchIndexEvictionPromise = null
      searchIndexEvictionTimer = null
    }
  }, searchIndexIdleTtlMs)
  searchIndexEvictionTimer.unref()
}

async function recallCandidates(
  index: SearchIndex,
  search: ExpandedSearch,
  limit: number,
): Promise<number[]> {
  if (search.candidates.length === 0) {
    return []
  }

  const recallPool = collectRecallPool(index, search)
  const finderOptions = {
    selector: (id: number) => index.names[id]!,
    tiebreakers: [byStartAsc, byLengthAsc],
    limit: Math.max(limit * 4, 60),
  }
  const fastFinder =
    recallPool.length === index.all.length
      ? index.fastFinder
      : new AsyncFzf(recallPool, finderOptions)
  const extendedFinder =
    recallPool.length === index.all.length
      ? index.extendedFinder
      : new AsyncFzf(recallPool, {
          ...finderOptions,
          match: asyncExtendedMatch,
        })
  const uniqueItems = new Set<number>()

  for (const id of recallPool) {
    if (uniqueItems.has(id)) {
      continue
    }

    for (const token of search.tokens) {
      if (getPrefix(index, id) === token) {
        uniqueItems.add(id)
        break
      }
    }
  }

  const foundItems =
    search.candidates.length === 1
      ? await fastFinder.find(search.candidates[0]!)
      : await extendedFinder.find(search.candidates.join(' | '))

  for (const entry of foundItems) {
    if (uniqueItems.has(entry.item)) {
      continue
    }

    uniqueItems.add(entry.item)
  }

  if (search.aliasTokens.size > 0) {
    for (const aliasToken of search.aliasTokens) {
      for (const prefix of preferredIconPrefixes.keys()) {
        const id = index.preferredByPrefix.get(prefix)?.get(aliasToken)

        if (id === undefined) {
          continue
        }

        uniqueItems.add(id)
      }
    }
  }

  return [...uniqueItems]
}

export async function searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
  const keyword = query.keyword.trim()
  const exactItems = await resolveExactIconSearch(keyword)

  if (exactItems) {
    return {
      list: exactItems.slice(0, query.limit),
    }
  }

  const index = await getSearchIndex()

  if (!keyword) {
    return {
      list: index.recommended.slice(0, query.limit).map((id) => toResponseItem(index, id)),
    }
  }

  const search = expandSearchCandidates(keyword)
  const recalled = await recallCandidates(index, search, query.limit)
  const ranked = recalled
    .map((id, indexOrder) => ({
      id,
      score: scoreSearchItem(index, id, search),
      indexOrder,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.indexOrder - right.indexOrder
    })
    .slice(0, query.limit)
    .map(({ id }) => toResponseItem(index, id))

  return { list: ranked }
}
