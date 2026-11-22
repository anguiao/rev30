import { createHash } from 'node:crypto'
import { completeIconIdSchema, iconifyIconNamePartPatternSource } from '@rev30/contracts'
import { z } from 'zod'
import { iconSearchCategorySchema } from '../concepts'
import { iconSearchFactsSchema } from '../facts'
import { hanCharacterPattern } from '../normalization'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
export const artifactFileSuffix = '.jsonl.gz'
const artifactPathPattern = new RegExp(`^${iconifyIconNamePartPatternSource}\\.jsonl\\.gz$`)

export const artifactFileSchema = z.strictObject({
  path: z.string().regex(artifactPathPattern),
  checksum: sha256Schema,
  documents: z.int().nonnegative(),
  bytes: z.int().positive(),
})

export const runtimeManifestSchema = z.strictObject({
  formatVersion: z.literal(6),
  indexVersion: sha256Schema,
  iconPackageVersion: z.string().min(1),
  indexRulesVersion: sha256Schema,
  contentFingerprint: sha256Schema,
  // Canonical order: IconPark, RemixIcon, CLDR emoji, ISO flags.
  officialChecksums: z.array(sha256Schema).length(4),
  counts: z.strictObject({
    definitions: z.int().nonnegative(),
    aliases: z.int().nonnegative(),
    documents: z.int().nonnegative(),
    chineseDocuments: z.int().nonnegative(),
  }),
  files: z.array(artifactFileSchema),
})

export type IconSearchRuntimeManifest = z.infer<typeof runtimeManifestSchema>

export const artifactDocumentSchema = iconSearchFactsSchema.extend({
  id: completeIconIdSchema,
  source: z.literal('builtin'),
  category: iconSearchCategorySchema.exclude(['custom']),
  customIconId: z.null(),
})

export type IconSearchArtifactDocument = z.infer<typeof artifactDocumentSchema>

export function artifactCollectionPrefix(path: string): string {
  return path.slice(0, -artifactFileSuffix.length)
}

export function hasArtifactChineseText(document: IconSearchArtifactDocument): boolean {
  return (
    document.primaryTokens.some((token) => hanCharacterPattern.test(token)) ||
    document.relatedTokens.some((token) => hanCharacterPattern.test(token))
  )
}

export function checksum(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function deriveIconSearchIndexVersion({
  iconPackageVersion,
  indexRulesVersion,
  contentFingerprint,
  officialChecksums,
}: Pick<
  IconSearchRuntimeManifest,
  'iconPackageVersion' | 'indexRulesVersion' | 'contentFingerprint' | 'officialChecksums'
>): string {
  return checksum(
    JSON.stringify([
      iconPackageVersion,
      indexRulesVersion,
      contentFingerprint,
      ...officialChecksums,
    ]),
  )
}
