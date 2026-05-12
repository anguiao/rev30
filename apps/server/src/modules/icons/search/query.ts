import { chineseIconSearchAliases, iconSearchAliasGroups } from './config'
import type { ExpandedSearch } from './types'

const maxSearchCandidateCount = 12

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

export function expandSearchCandidates(keyword: string): ExpandedSearch {
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
