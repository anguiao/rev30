import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { IconSearchDocument } from '../document'

export type BuiltinIconSearchDocument = IconSearchDocument & {
  source: 'builtin'
  customIconId: null
}

const artifactFileSchema = z
  .object({
    path: z.string().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    documents: z.int().nonnegative(),
    bytes: z.int().nonnegative(),
  })
  .strict()

export const runtimeManifestSchema = z
  .object({
    formatVersion: z.literal(4),
    iconPackageVersion: z.string().min(1),
    searchDataVersion: z.string().min(1),
    rulesVersion: z.string().min(1),
    indexVersion: z.string().regex(/^[a-f0-9]{64}$/),
    contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    counts: z
      .object({
        definitions: z.int().nonnegative(),
        aliases: z.int().nonnegative(),
        documents: z.int().nonnegative(),
        validTranslations: z.int().nonnegative(),
        chineseDocuments: z.int().nonnegative(),
      })
      .strict(),
    files: z.array(artifactFileSchema),
  })
  .strict()

const builtinDocumentSchema = z
  .object({
    id: z.string().min(1),
    prefix: z.string().min(1),
    name: z.string().min(1),
    source: z.literal('builtin'),
    collection: z.string().min(1),
    palette: z.boolean(),
    customIconId: z.null(),
    exactPhrases: z.array(z.string()),
    fullTokens: z.array(z.string()),
    primaryTokens: z.array(z.string()),
    primaryEnglishTerms: z.array(z.string()),
    auxiliaryEnglishTerms: z.array(z.string()),
  })
  .strict()

export type IconSearchRuntimeManifest = z.infer<typeof runtimeManifestSchema>

export function checksum(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function deriveIconSearchIndexVersion(input: {
  iconPackageVersion: string
  searchDataVersion: string
  rulesVersion: string
  contentFingerprint: string
}): string {
  return checksum(
    `${input.iconPackageVersion}\0${input.searchDataVersion}\0${input.rulesVersion}\0${input.contentFingerprint}`,
  )
}

export function assertDocument(value: unknown): asserts value is BuiltinIconSearchDocument {
  const result = builtinDocumentSchema.safeParse(value)
  if (!result.success) throw new Error('Invalid icon search document')
  if (result.data.id !== `${result.data.prefix}:${result.data.name}`) {
    throw new Error(`Icon search document identity mismatch: ${result.data.id}`)
  }
}
