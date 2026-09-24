import { normalizeSearchText } from '@rev30/utils'

const validCharacterPattern = /[\p{L}\p{N}]/u
const asciiEnglishTermPattern = /^[a-z]+$/
const boundedAsciiPhrasePattern = /^[a-z0-9]+(?:[-/]+[a-z0-9]+)+$/

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
