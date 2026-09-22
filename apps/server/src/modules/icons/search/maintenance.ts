import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, normalize } from 'node:path'
import { z } from 'zod'
import { normalizeSearchText } from '@rev30/utils'

import { deriveSearchText } from './text'

const translationSchema = z
  .string()
  .min(1)
  .refine((value) => deriveSearchText(value).tokens.length > 0)

const maintainedFileSchema = z
  .object({
    kind: z.literal('translations'),
    path: z.string().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

const maintainedManifestSchema = z
  .object({
    formatVersion: z.literal(2),
    iconPackageVersion: z.string().min(1),
    dataVersion: z.string().min(1),
    files: z.array(maintainedFileSchema),
  })
  .strict()

const iconTranslationRecordSchema = z
  .object({
    kind: z.literal('icon'),
    owner: z.string().min(1),
    source: z.string().min(1),
    translations: z.array(translationSchema).min(1),
  })
  .strict()

const categoryTranslationRecordSchema = z
  .object({
    kind: z.literal('category'),
    owner: z.object({ prefix: z.string().min(1), category: z.string().min(1) }).strict(),
    source: z.string().min(1),
    translations: z.array(translationSchema).min(1),
  })
  .strict()

const maintainedTranslationRecordSchema = z.discriminatedUnion('kind', [
  iconTranslationRecordSchema,
  categoryTranslationRecordSchema,
])

type MaintainedManifest = z.infer<typeof maintainedManifestSchema>

export type MaintainedIconTranslationRecord = z.infer<typeof iconTranslationRecordSchema>
export type MaintainedCategoryTranslationRecord = z.infer<typeof categoryTranslationRecordSchema>
export type MaintainedTranslationRecord = z.infer<typeof maintainedTranslationRecordSchema>
export type MaintainedSearchData = Omit<MaintainedManifest, 'files'> & {
  translations: MaintainedTranslationRecord[]
}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseManifest(value: unknown): MaintainedManifest {
  const parsed = maintainedManifestSchema.safeParse(value)
  if (!parsed.success) throw new Error('Invalid maintained data manifest')
  const manifest = parsed.data
  const paths = new Set<string>()
  for (const file of manifest.files) {
    if (isAbsolute(file.path) || normalize(file.path).startsWith('..') || paths.has(file.path)) {
      throw new Error('Invalid maintained data file descriptor')
    }
    paths.add(file.path)
  }
  return manifest
}

export async function loadMaintainedSearchData(directory: string): Promise<MaintainedSearchData> {
  const manifest = parseManifest(
    JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
  )
  const translations: MaintainedTranslationRecord[] = []

  for (const file of manifest.files) {
    const content = await readFile(join(directory, file.path), 'utf8')
    if (checksum(content) !== file.checksum) {
      throw new Error(`Maintained data checksum mismatch: ${file.path}`)
    }
    for (const [index, line] of content.split('\n').entries()) {
      if (!line) continue
      let record: unknown
      try {
        record = JSON.parse(line)
      } catch {
        throw new Error(`Invalid JSON in ${file.path}:${index + 1}`)
      }
      const parsed = maintainedTranslationRecordSchema.safeParse(record)
      if (!parsed.success)
        throw new Error(`Invalid translation record in ${file.path}:${index + 1}`)
      translations.push(parsed.data)
    }
  }

  const keys = new Set<string>()
  for (const record of translations) {
    const owner =
      typeof record.owner === 'string'
        ? record.owner
        : `${record.owner.prefix}\0${record.owner.category}`
    const key = `${record.kind}\0${owner}\0${normalizeSearchText(record.source)}`
    if (keys.has(key)) {
      throw new Error(`Duplicate maintained record: ${owner.replace('\0', ':')} / ${record.source}`)
    }
    keys.add(key)
  }
  return {
    formatVersion: manifest.formatVersion,
    iconPackageVersion: manifest.iconPackageVersion,
    dataVersion: manifest.dataVersion,
    translations,
  }
}
