import type { IconSearchItem } from '@rev30/contracts'
import { AsyncFzf, asyncExtendedMatch, byLengthAsc, byStartAsc } from 'fzf'
import { deprioritizedIconPrefixes, preferredIconPrefixes } from './config'
import { getPrefix } from './search-index'
import type { ExpandedSearch, SearchIndex } from './types'

const minimumFuzzyCandidateLength = 3
const fuzzyCandidatePattern = /^[a-z0-9-]+$/

export function scoreIconSearchItem(item: IconSearchItem, expandedSearch: ExpandedSearch): number {
  let score = 0
  const prefix = item.prefix.toLowerCase()
  const name = item.name.toLowerCase()
  const hasDirectTokens = expandedSearch.tokens.length > 0
  const preferredAliasExactScore = hasDirectTokens ? 450 : 5000
  const aliasExactScore = hasDirectTokens ? 350 : 3000
  const aliasPrefixScore = hasDirectTokens ? 120 : 520
  const aliasContainsScore = hasDirectTokens ? 20 : 60

  for (const aliasToken of expandedSearch.aliasTokens) {
    if (aliasToken === expandedSearch.normalizedKeyword) {
      continue
    }

    if (preferredIconPrefixes.has(prefix) && name === aliasToken) {
      score += preferredAliasExactScore
    }
  }

  if (name === expandedSearch.normalizedKeyword) {
    score += 10000
  }

  for (const token of expandedSearch.tokens) {
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

  for (const aliasToken of expandedSearch.aliasTokens) {
    if (aliasToken !== expandedSearch.normalizedKeyword && name === aliasToken) {
      score += aliasExactScore
      continue
    }

    if (aliasToken !== expandedSearch.normalizedKeyword && name.startsWith(`${aliasToken}-`)) {
      score += aliasPrefixScore
      continue
    }

    if (name.includes(aliasToken)) {
      score += aliasContainsScore
    }
  }

  score += preferredIconPrefixes.get(prefix) ?? 0

  if (!item.palette) {
    score += 24
  } else {
    score -= 12
  }

  if (deprioritizedIconPrefixes.has(prefix)) {
    score -= 36
  }

  return score
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

function collectRecallPool(index: SearchIndex, expandedSearch: ExpandedSearch): number[] {
  const uniqueItems = new Set<number>()
  const matchedTokens = new Set<string>()

  for (const candidate of expandedSearch.candidates) {
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

export async function recallCandidates(
  index: SearchIndex,
  expandedSearch: ExpandedSearch,
  limit: number,
): Promise<number[]> {
  if (expandedSearch.candidates.length === 0) {
    return []
  }

  const recallPool = collectRecallPool(index, expandedSearch)
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

    for (const token of expandedSearch.tokens) {
      if (getPrefix(index, id) === token) {
        uniqueItems.add(id)
        break
      }
    }
  }

  const foundItems =
    expandedSearch.candidates.length === 1
      ? await fastFinder.find(expandedSearch.candidates[0]!)
      : await extendedFinder.find(expandedSearch.candidates.join(' | '))

  for (const entry of foundItems) {
    if (uniqueItems.has(entry.item)) {
      continue
    }

    uniqueItems.add(entry.item)
  }

  if (expandedSearch.aliasTokens.size > 0) {
    for (const aliasToken of expandedSearch.aliasTokens) {
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
