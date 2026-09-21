import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { IconSearchDocument } from '../document'
import { deriveSearchText } from '../text'

export type IconPackageCollection = {
  prefix: string
  collection: string
  palette: boolean
  icons: string[]
  hidden?: string[]
  aliases: Record<string, { parent: string }>
  categories?: Record<string, string[]>
}

export type MaintainedEnglishRecord = {
  kind: 'icon' | 'category'
  owner: string
  source: string
  terms: string[]
}

export type MaintainedIconTranslationRecord = {
  kind: 'icon'
  owner: string
  source: string
  translations: string[]
}

export type CategoryTranslationOwner = {
  prefix: string
  category: string
}

export type MaintainedCategoryTranslationRecord = {
  kind: 'category'
  owner: CategoryTranslationOwner
  source: string
  translations: string[]
}

export type MaintainedTranslationRecord =
  | MaintainedIconTranslationRecord
  | MaintainedCategoryTranslationRecord

export type MaintainedSearchData = {
  formatVersion: 1
  iconPackageVersion: string
  dataVersion: string
  english: MaintainedEnglishRecord[]
  translations: MaintainedTranslationRecord[]
}

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
    formatVersion: z.literal(2),
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
        validEnglishRecords: z.int().nonnegative(),
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
    primaryEnglishTerms: z.array(z.string()),
    auxiliaryEnglishTerms: z.array(z.string()),
  })
  .strict()

export type IconSearchRuntimeManifest = z.infer<typeof runtimeManifestSchema>

export type ExcludedMaintainedRecord = {
  kind: 'english' | 'translation'
  owner: string | CategoryTranslationOwner
  source: string
  reason: string
}

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

function assertPlainString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${label} must be a non-empty string`)
}

export function assertDocument(value: unknown): asserts value is BuiltinIconSearchDocument {
  const result = builtinDocumentSchema.safeParse(value)
  if (!result.success) throw new Error('Invalid icon search document')
  if (result.data.id !== `${result.data.prefix}:${result.data.name}`) {
    throw new Error(`Icon search document identity mismatch: ${result.data.id}`)
  }
}

export function validateMaintainedSearchData(maintained: MaintainedSearchData) {
  if (maintained.formatVersion !== 1) throw new Error('Unsupported maintained data formatVersion')
  assertPlainString(maintained.iconPackageVersion, 'iconPackageVersion')
  assertPlainString(maintained.dataVersion, 'dataVersion')
  if (!Array.isArray(maintained.english) || !Array.isArray(maintained.translations)) {
    throw new Error('Maintained records must be arrays')
  }

  const keys = new Set<string>()
  const validateRecords = <T extends MaintainedEnglishRecord | MaintainedIconTranslationRecord>(
    recordKind: 'english' | 'translation',
    records: T[],
    getValues: (record: T) => string[],
  ) => {
    for (const record of records) {
      if (!record || (record.kind !== 'icon' && record.kind !== 'category')) {
        throw new Error(`Invalid ${recordKind} record kind`)
      }
      assertPlainString(record.owner, `${recordKind}.owner`)
      assertPlainString(record.source, `${recordKind}.source`)
      const values = getValues(record)
      if (
        !Array.isArray(values) ||
        values.some((value) => typeof value !== 'string' || value.length === 0) ||
        (recordKind === 'translation' &&
          (values.length === 0 ||
            values.some((value) => deriveSearchText(value).tokens.length === 0)))
      ) {
        throw new Error(`Invalid ${recordKind} record values for ${record.owner}`)
      }
      const normalizedSource = deriveSearchText(record.source).phrase
      const key = `${recordKind}\0${record.kind}\0${record.owner}\0${normalizedSource}`
      if (keys.has(key))
        throw new Error(`Duplicate maintained record: ${record.owner} / ${record.source}`)
      keys.add(key)
    }
  }
  validateRecords('english', maintained.english, (record) => record.terms)
  validateRecords(
    'translation',
    maintained.translations.filter(
      (record): record is MaintainedIconTranslationRecord => record.kind === 'icon',
    ),
    (record) => record.translations,
  )
  for (const record of maintained.translations) {
    if (record.kind !== 'category') continue
    assertPlainString(record.owner.prefix, 'translation.owner.prefix')
    assertPlainString(record.owner.category, 'translation.owner.category')
    assertPlainString(record.source, 'translation.source')
    if (
      !Array.isArray(record.translations) ||
      record.translations.length === 0 ||
      record.translations.some(
        (value) => typeof value !== 'string' || deriveSearchText(value).tokens.length === 0,
      )
    ) {
      throw new Error(`Invalid translation record values for ${record.owner.category}`)
    }
    const key = `translation\0category\0${record.owner.prefix}\0${record.owner.category}\0${deriveSearchText(record.source).phrase}`
    if (keys.has(key))
      throw new Error(
        `Duplicate maintained record: ${record.owner.prefix}:${record.owner.category} / ${record.source}`,
      )
    keys.add(key)
  }
}
