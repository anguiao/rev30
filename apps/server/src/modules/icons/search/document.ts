import { deriveSearchText, mergeWeightedEnglishTerms } from './text'

export type IconSearchDocument = {
  id: string
  prefix: string
  name: string
  source: 'builtin' | 'custom'
  collection: string
  palette: boolean
  customIconId: string | null
  exactPhrases: string[]
  fullTokens: string[]
  primaryTokens: string[]
  primaryEnglishTerms: string[]
  auxiliaryEnglishTerms: string[]
}

export function deriveIconSearchDocument(
  input: Omit<
    IconSearchDocument,
    | 'exactPhrases'
    | 'fullTokens'
    | 'primaryTokens'
    | 'primaryEnglishTerms'
    | 'auxiliaryEnglishTerms'
  > & {
    primaryPhrases: string[]
    auxiliaryPhrases: string[]
    exactPhrases: string[]
  },
): IconSearchDocument {
  const primary = input.primaryPhrases.map(deriveSearchText)
  const auxiliary = input.auxiliaryPhrases.map(deriveSearchText)
  const weighted = mergeWeightedEnglishTerms([
    { weight: 'A', terms: primary.flatMap((entry) => entry.englishTerms) },
    { weight: 'B', terms: auxiliary.flatMap((entry) => entry.englishTerms) },
  ])
  return {
    id: input.id,
    prefix: input.prefix,
    name: input.name,
    source: input.source,
    collection: input.collection,
    palette: input.palette,
    customIconId: input.customIconId,
    exactPhrases: [
      ...new Set(
        input.exactPhrases
          .map(deriveSearchText)
          .filter((entry) => entry.tokens.length > 0)
          .map((entry) => entry.phrase),
      ),
    ],
    fullTokens: [...new Set([...primary, ...auxiliary].flatMap((entry) => entry.tokens))].sort(),
    primaryTokens: [...new Set(primary.flatMap((entry) => entry.tokens))].sort(),
    primaryEnglishTerms: weighted.A,
    auxiliaryEnglishTerms: weighted.B,
  }
}
