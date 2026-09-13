export const ICON_SEARCH_RULES_VERSION = '2'

const validCharacterPattern = /[\p{L}\p{N}]/u
const asciiEnglishTermPattern = /^[a-z]+$/
const boundedAsciiPhrasePattern = /^[a-z0-9]+(?:[-/]+[a-z0-9]+)+$/

export type SearchText = {
  phrase: string
  tokens: string[]
  englishTerms: string[]
}

export type EnglishTermWeight = 'A' | 'B'

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ')
}

export function deriveSearchText(value: string): SearchText {
  const phrase = normalizeSearchText(value)
  const tokens = new Set<string>()

  for (const whitespacePart of phrase.split(' ')) {
    const parts = boundedAsciiPhrasePattern.test(whitespacePart)
      ? whitespacePart.split(/[-/]+/)
      : [whitespacePart]
    for (const token of parts) {
      if (validCharacterPattern.test(token)) {
        tokens.add(token)
      }
    }
  }

  const orderedTokens = [...tokens]
  return {
    phrase,
    tokens: orderedTokens,
    englishTerms: orderedTokens.filter((token) => asciiEnglishTermPattern.test(token)),
  }
}

export function mergeWeightedEnglishTerms(
  fields: { terms: readonly string[]; weight: EnglishTermWeight }[],
): { A: string[]; B: string[] } {
  const primary = new Set<string>()
  const auxiliary = new Set<string>()

  for (const field of fields) {
    for (const term of field.terms) {
      if (field.weight === 'A') {
        primary.add(term)
        auxiliary.delete(term)
      } else if (!primary.has(term)) {
        auxiliary.add(term)
      }
    }
  }

  return { A: [...primary].sort(), B: [...auxiliary].sort() }
}
