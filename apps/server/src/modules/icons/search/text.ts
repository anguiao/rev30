import { normalizeSearchText } from '@rev30/utils'

export const hanCharacterPattern = /\p{Script=Han}/u
export const asciiEnglishTermPattern = /^[a-z]+$/

const validCharacterPattern = /[\p{L}\p{N}]/u
const boundedAsciiPhrasePattern = /^[a-z0-9]+(?:[-/]+[a-z0-9]+)+$/
const compactBoundaryPattern =
  /(?<=\p{Script=Han}) (?=[\p{Script=Han}a-z0-9])|(?<=[a-z0-9]) (?=\p{Script=Han})/gu

export function compactIconSearchKey(normalizedPhrase: string): string {
  return normalizedPhrase.replace(compactBoundaryPattern, '')
}

export function iconSearchPhraseKeys(normalizedPhrase: string): string[] {
  const compact = compactIconSearchKey(normalizedPhrase)
  return compact === normalizedPhrase ? [normalizedPhrase] : [normalizedPhrase, compact]
}

export function deriveSearchText(value: string) {
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
