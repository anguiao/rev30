import { iconifyIconNamePartPatternSource, type IconSearchItem } from '@rev30/contracts'
import { lookupCollection } from '@iconify/json'
import { AsyncFzf, asyncExtendedMatch, byLengthAsc, byStartAsc } from 'fzf'
import { preferredIconPrefixes, recommendedIconNames } from './config'
import { loadIconCollections } from './collections'
import type { SearchIndex } from './types'

let builtinSearchIndexPromise: Promise<SearchIndex> | null = null
let builtinSearchIndexIdleTimer: ReturnType<typeof setTimeout> | null = null
let builtinSearchIndexIdlePromise: Promise<SearchIndex> | null = null

const defaultSearchIndexIdleTtlMs = 15 * 60 * 1000
const maxTimerDelayMs = 2 ** 31 - 1
const searchTokenPattern = new RegExp(iconifyIconNamePartPatternSource, 'g')
const searchIndexIdleTtlMs = readSearchIndexIdleTtlMs()
const recommendedIconNameIndexes = new Map(
  recommendedIconNames.map((iconName, index) => [iconName, index]),
)

function readSearchIndexIdleTtlMs(): number {
  const value = Number(process.env.ICON_SEARCH_INDEX_IDLE_TTL_MS ?? defaultSearchIndexIdleTtlMs)

  if (!Number.isInteger(value) || value > maxTimerDelayMs) {
    throw new Error(`ICON_SEARCH_INDEX_IDLE_TTL_MS 必须是整数，且不能超过 ${maxTimerDelayMs}`)
  }

  return value
}

export function getPrefix(index: SearchIndex, id: number): string {
  return index.prefixes[index.prefixIds[id]!]!
}

function getCollection(index: SearchIndex, id: number): string {
  return index.collections[index.collectionIds[id]!]!
}

function toIconName(index: SearchIndex, id: number): string {
  return `${getPrefix(index, id)}:${index.names[id]}`
}

export function toBuiltinIconSearchItem(index: SearchIndex, id: number): IconSearchItem {
  return {
    icon: toIconName(index, id),
    prefix: getPrefix(index, id),
    name: index.names[id]!,
    collection: getCollection(index, id),
    palette: index.palettes[id]!,
  }
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

async function buildBuiltinSearchIndex(): Promise<SearchIndex> {
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

function refreshBuiltinSearchIndexIdleTimer(indexPromise: Promise<SearchIndex>) {
  if (searchIndexIdleTtlMs <= 0) {
    return
  }

  if (builtinSearchIndexIdleTimer && builtinSearchIndexIdlePromise === indexPromise) {
    builtinSearchIndexIdleTimer.refresh()
    return
  }

  if (builtinSearchIndexIdleTimer) {
    clearTimeout(builtinSearchIndexIdleTimer)
  }

  builtinSearchIndexIdlePromise = indexPromise
  builtinSearchIndexIdleTimer = setTimeout(() => {
    if (builtinSearchIndexPromise === indexPromise) {
      builtinSearchIndexPromise = null
    }

    if (builtinSearchIndexIdlePromise === indexPromise) {
      builtinSearchIndexIdlePromise = null
      builtinSearchIndexIdleTimer = null
    }
  }, searchIndexIdleTtlMs)
  builtinSearchIndexIdleTimer.unref()
}

export async function getBuiltinSearchIndex(): Promise<SearchIndex> {
  if (!builtinSearchIndexPromise) {
    builtinSearchIndexPromise = buildBuiltinSearchIndex().catch((error) => {
      builtinSearchIndexPromise = null
      throw error
    })
  }

  const indexPromise = builtinSearchIndexPromise
  const index = await indexPromise
  refreshBuiltinSearchIndexIdleTimer(indexPromise)

  return index
}
