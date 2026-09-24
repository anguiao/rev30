import { z } from 'zod'
import { deriveSearchText } from './text'

const iconSearchMetadataSchema = z
  .object({
    id: z.string().min(1),
    prefix: z.string().min(1),
    name: z.string().min(1),
    source: z.enum(['builtin', 'custom']),
    collection: z.string().min(1),
    palette: z.boolean(),
    customIconId: z.string().nullable(),
  })
  .strict()

export type IconSearchMetadata = z.infer<typeof iconSearchMetadataSchema>

export const iconSearchDocumentSchema = iconSearchMetadataSchema.extend({
  exactPhrases: z.array(z.string()),
  fullTokens: z.array(z.string()),
  primaryTokens: z.array(z.string()),
  primaryEnglishTerms: z.array(z.string()),
  auxiliaryEnglishTerms: z.array(z.string()),
})

export type IconSearchDocument = z.infer<typeof iconSearchDocumentSchema>

type IconSearchDocumentInput = IconSearchMetadata & {
  primaryPhrases: string[]
  auxiliaryPhrases: string[]
  exactPhrases: string[]
}

export type CustomIconSearchInput = Pick<
  IconSearchMetadata,
  'prefix' | 'name' | 'collection' | 'palette'
> & {
  customIconId: string
  keywords: string[]
}

export function deriveIconSearchDocument(input: IconSearchDocumentInput): IconSearchDocument {
  const primary = input.primaryPhrases.map(deriveSearchText)
  const auxiliary = input.auxiliaryPhrases.map(deriveSearchText)
  const primaryEnglishTerms = new Set(primary.flatMap((entry) => entry.englishTerms))
  const auxiliaryEnglishTerms = new Set(auxiliary.flatMap((entry) => entry.englishTerms))
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
    primaryEnglishTerms: [...primaryEnglishTerms].sort(),
    auxiliaryEnglishTerms: [...auxiliaryEnglishTerms]
      .filter((term) => !primaryEnglishTerms.has(term))
      .sort(),
  }
}

export function deriveCustomIconSearchDocument(input: CustomIconSearchInput): IconSearchDocument {
  return deriveIconSearchDocument({
    ...input,
    id: `${input.prefix}:${input.name}`,
    source: 'custom',
    primaryPhrases: [input.name, ...input.keywords],
    auxiliaryPhrases: [input.prefix, input.collection],
    exactPhrases: [input.name, ...input.keywords],
  })
}
