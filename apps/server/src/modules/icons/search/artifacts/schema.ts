import { createHash } from 'node:crypto'
import { z } from 'zod'
import { iconSearchDocumentSchema } from '../document'

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
    formatVersion: z.literal(5),
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

export type IconSearchRuntimeManifest = z.infer<typeof runtimeManifestSchema>

export const artifactDocumentSchema = iconSearchDocumentSchema.extend({
  source: z.literal('builtin'),
  customIconId: z.null(),
})

export type IconSearchArtifactDocument = z.infer<typeof artifactDocumentSchema>

export function checksum(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function deriveIconSearchIndexVersion(
  input: Pick<
    IconSearchRuntimeManifest,
    'iconPackageVersion' | 'searchDataVersion' | 'rulesVersion' | 'contentFingerprint'
  >,
): string {
  return checksum(
    `${input.iconPackageVersion}\0${input.searchDataVersion}\0${input.rulesVersion}\0${input.contentFingerprint}`,
  )
}
