import { normalizeSearchText } from '@rev30/utils'
import { z } from 'zod'

import { iconSearchCategorySchema, type IconSearchCategory } from './concepts'
import { compactIconSearchKey } from './normalization'
import { deriveSearchText } from './text'

const iconSearchMetadataSchema = z.strictObject({
  id: z.string().min(1),
  prefix: z.string().min(1),
  name: z.string().min(1),
  source: z.enum(['builtin', 'custom']),
  collection: z.string().min(1),
  palette: z.boolean(),
  customIconId: z.string().nullable(),
})

export const iconSearchFactsSchema = iconSearchMetadataSchema.extend({
  category: iconSearchCategorySchema,
  exactKeys: z.array(z.string()),
  tokens: z.array(z.string()),
  primaryTokens: z.array(z.string()),
  relatedTokens: z.array(z.string()),
  primaryNameText: z.string(),
  keywordText: z.string(),
  categoryText: z.string(),
  collectionText: z.string(),
  primaryEnglishTerms: z.array(z.string()),
  auxiliaryEnglishTerms: z.array(z.string()),
})

export type IconSearchMetadata = z.infer<typeof iconSearchMetadataSchema>
export type IconSearchFacts = z.infer<typeof iconSearchFactsSchema>

export type CustomIconSearchInput = Pick<
  IconSearchMetadata,
  'prefix' | 'name' | 'collection' | 'palette'
> & {
  customIconId: string
  keywords: readonly string[]
}

type SearchFields = {
  keywords?: readonly string[]
  titles?: readonly string[]
  tags?: readonly string[]
  categories?: readonly string[]
}

const englishWordPattern = /^[a-z]+$/
const asciiTermPattern = /^[a-z0-9]+$/

export function deriveIconSearchName(name: string) {
  const key = normalizeSearchText(name)
  return { key, terms: key.split(/[-/]+/) }
}

export function iconSearchVectorTerms(tokens: readonly string[]) {
  return tokens.filter((token) => asciiTermPattern.test(token))
}

function distinctSorted(terms: Iterable<string>): string[] {
  return [...new Set(terms)].sort()
}

function phraseKeys(phrase: string): string[] {
  const compact = compactIconSearchKey(phrase)
  return compact === phrase ? [phrase] : [phrase, compact]
}

export function deriveIconSearchFacts<
  Metadata extends IconSearchMetadata & { category: IconSearchCategory },
>(icon: Metadata, { keywords = [], titles = [], tags = [], categories = [] }: SearchFields) {
  const name = deriveIconSearchName(icon.name)
  const keywordEntries = keywords.map(deriveSearchText)
  const keywordTokens = keywordEntries.flatMap(({ tokens }) => tokens)
  const categoryTokens = categories.flatMap((category) => deriveSearchText(category).tokens)
  const collectionTokens = [icon.prefix, icon.collection].flatMap(
    (value) => deriveSearchText(value).tokens,
  )
  const primaryKeys = [
    ...keywordEntries.map(({ phrase }) => phrase),
    ...titles.map(normalizeSearchText),
  ].flatMap(phraseKeys)
  const primaryTokens = distinctSorted([...name.terms, ...keywordTokens, ...primaryKeys])
  // The English rank vector preserves the original two groups and their term order.
  const primaryEnglishTerms = new Set(
    [...name.terms, ...keywordTokens].filter((token) => englishWordPattern.test(token)),
  )
  const auxiliaryEnglishTerms = [...categoryTokens, ...collectionTokens].filter(
    (token) => englishWordPattern.test(token) && !primaryEnglishTerms.has(token),
  )

  return {
    ...icon,
    exactKeys: [...new Set([name.key, ...primaryKeys])],
    tokens: distinctSorted([...primaryTokens, ...categoryTokens, ...collectionTokens]),
    primaryTokens,
    relatedTokens: distinctSorted(tags.map(normalizeSearchText).flatMap(phraseKeys)),
    primaryNameText: name.terms.join(' '),
    keywordText: distinctSorted(iconSearchVectorTerms(keywordTokens)).join(' '),
    categoryText: distinctSorted(iconSearchVectorTerms(categoryTokens)).join(' '),
    collectionText: distinctSorted(iconSearchVectorTerms(collectionTokens)).join(' '),
    primaryEnglishTerms: [...primaryEnglishTerms].sort(),
    auxiliaryEnglishTerms: distinctSorted(auxiliaryEnglishTerms),
  }
}

export function deriveCustomIconSearchFacts({
  keywords,
  ...icon
}: CustomIconSearchInput): IconSearchFacts {
  return deriveIconSearchFacts(
    { ...icon, id: `${icon.prefix}:${icon.name}`, source: 'custom', category: 'custom' },
    { keywords },
  )
}
