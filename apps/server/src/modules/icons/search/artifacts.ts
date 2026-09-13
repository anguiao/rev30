import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

import { deriveIconSearchDocument, type IconSearchDocument } from './document'
import { ICON_SEARCH_RULES_VERSION, deriveSearchText } from './text'

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

export type MaintainedTranslationRecord = {
  kind: 'icon' | 'category'
  owner: string
  source: string
  translations: string[]
}

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

const runtimeManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    iconPackageVersion: z.string().min(1),
    searchDataVersion: z.string().min(1),
    rulesVersion: z.string().min(1),
    indexVersion: z.string().regex(/^[a-f0-9]{64}$/),
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
  owner: string
  source: string
  reason: string
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function checksum(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function deriveIconSearchIndexVersion(input: {
  iconPackageVersion: string
  searchDataVersion: string
  rulesVersion: string
}): string {
  return checksum(`${input.iconPackageVersion}\0${input.searchDataVersion}\0${input.rulesVersion}`)
}

function assertPlainString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${label} must be a non-empty string`)
}

function assertDocument(value: unknown): asserts value is BuiltinIconSearchDocument {
  const result = builtinDocumentSchema.safeParse(value)
  if (!result.success) throw new Error('Invalid icon search document')
  if (result.data.id !== `${result.data.prefix}:${result.data.name}`) {
    throw new Error(`Icon search document identity mismatch: ${result.data.id}`)
  }
}

function resolveAlias(
  name: string,
  icons: Set<string>,
  aliases: Record<string, { parent: string }>,
  seen = new Set<string>(),
): boolean {
  if (icons.has(name)) return true
  if (seen.has(name)) return false
  const alias = aliases[name]
  if (!alias) return false
  seen.add(name)
  return resolveAlias(alias.parent, icons, aliases, seen)
}

export function validateMaintainedSearchData(maintained: MaintainedSearchData) {
  if (maintained.formatVersion !== 1) throw new Error('Unsupported maintained data formatVersion')
  assertPlainString(maintained.iconPackageVersion, 'iconPackageVersion')
  assertPlainString(maintained.dataVersion, 'dataVersion')
  if (!Array.isArray(maintained.english) || !Array.isArray(maintained.translations)) {
    throw new Error('Maintained records must be arrays')
  }

  const keys = new Set<string>()
  const validateRecords = <T extends MaintainedEnglishRecord | MaintainedTranslationRecord>(
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
        values.some((value) => typeof value !== 'string' || value.length === 0)
      ) {
        throw new Error(`Invalid ${recordKind} record values for ${record.owner}`)
      }
      const key = `${recordKind}\0${record.kind}\0${record.owner}\0${record.source}`
      if (keys.has(key))
        throw new Error(`Duplicate maintained record: ${record.owner} / ${record.source}`)
      keys.add(key)
    }
  }
  validateRecords('english', maintained.english, (record) => record.terms)
  validateRecords('translation', maintained.translations, (record) => record.translations)
}

function validateEnglishRecord(record: MaintainedEnglishRecord): boolean {
  const sourceTerms = new Set(deriveSearchText(record.source).tokens)
  return record.terms.every((term) => {
    const derived = deriveSearchText(term)
    return derived.tokens.length === 1 && sourceTerms.has(derived.tokens[0]!)
  })
}

export async function buildIconSearchArtifacts(options: {
  collections: IconPackageCollection[]
  iconPackageVersion: string
  maintained: MaintainedSearchData
  outputDirectory: string
}): Promise<{ manifest: IconSearchRuntimeManifest; excluded: ExcludedMaintainedRecord[] }> {
  validateMaintainedSearchData(options.maintained)
  const excluded: ExcludedMaintainedRecord[] = []
  const documentsByPrefix = new Map<string, BuiltinIconSearchDocument[]>()
  const collectionByPrefix = new Map(options.collections.map((entry) => [entry.prefix, entry]))
  const englishByIcon = new Map<string, MaintainedEnglishRecord[]>()
  const categoriesByIcon = new Map<string, MaintainedEnglishRecord[]>()
  let validEnglishRecords = 0
  let definitions = 0
  let aliases = 0

  const prefixes = new Set<string>()
  for (const collection of options.collections) {
    if (prefixes.has(collection.prefix))
      throw new Error(`Duplicate icon collection: ${collection.prefix}`)
    prefixes.add(collection.prefix)
    const definitionNames = [...collection.icons, ...(collection.hidden ?? [])]
    if (new Set(definitionNames).size !== definitionNames.length) {
      throw new Error(`Duplicate icon definition in ${collection.prefix}`)
    }
    for (const alias of Object.keys(collection.aliases)) {
      if (definitionNames.includes(alias))
        throw new Error(`Icon and alias conflict: ${collection.prefix}:${alias}`)
    }
  }

  for (const record of options.maintained.english) {
    const colon = record.owner.indexOf(':')
    const prefix = colon < 0 ? '' : record.owner.slice(0, colon)
    const ownerName = colon < 0 ? '' : record.owner.slice(colon + 1)
    const collection = collectionByPrefix.get(prefix)
    const iconNames = collection
      ? new Set([
          ...collection.icons,
          ...(collection.hidden ?? []),
          ...Object.keys(collection.aliases),
        ])
      : new Set<string>()
    const validOwner = iconNames.has(ownerName)
    const nameText = deriveSearchText(ownerName)
    const sourceText = deriveSearchText(record.source)
    const validSource =
      record.kind === 'icon'
        ? sourceText.phrase === nameText.phrase ||
          (sourceText.tokens.length === 1 && nameText.tokens.includes(sourceText.phrase))
        : Boolean(collection?.categories?.[record.source]?.includes(ownerName))
    if (!validOwner || !validSource || !validateEnglishRecord(record)) {
      excluded.push({
        kind: 'english',
        owner: record.owner,
        source: record.source,
        reason: 'stale owner, source, or category relationship',
      })
      continue
    }
    validEnglishRecords++
    const target = record.kind === 'icon' ? englishByIcon : categoriesByIcon
    target.set(record.owner, [...(target.get(record.owner) ?? []), record])
  }

  for (const record of options.maintained.translations) {
    excluded.push({
      kind: 'translation',
      owner: record.owner,
      source: record.source,
      reason: 'translation is not included in the English-only artifact',
    })
  }

  for (const collection of [...options.collections].sort((a, b) =>
    compareText(a.prefix, b.prefix),
  )) {
    const iconSet = new Set([...collection.icons, ...(collection.hidden ?? [])])
    definitions += iconSet.size
    aliases += Object.keys(collection.aliases).length
    for (const alias of Object.keys(collection.aliases)) {
      if (!resolveAlias(alias, iconSet, collection.aliases))
        throw new Error(`Cannot resolve alias ${collection.prefix}:${alias}`)
    }

    const documents: BuiltinIconSearchDocument[] = []
    const names = [...iconSet, ...Object.keys(collection.aliases)].sort(compareText)
    for (const name of names) {
      const categoryEntries = categoriesByIcon.get(`${collection.prefix}:${name}`) ?? []
      const maintainedTerms = (englishByIcon.get(`${collection.prefix}:${name}`) ?? []).flatMap(
        (entry) => entry.terms,
      )
      documents.push(
        deriveIconSearchDocument({
          id: `${collection.prefix}:${name}`,
          prefix: collection.prefix,
          name,
          source: 'builtin',
          collection: collection.collection,
          palette: collection.palette,
          customIconId: null,
          primaryPhrases: [name, ...maintainedTerms],
          auxiliaryPhrases: [
            collection.prefix,
            collection.collection,
            ...categoryEntries.flatMap((entry) => [entry.source, ...entry.terms]),
          ],
          exactPhrases: [name],
        }) as BuiltinIconSearchDocument,
      )
    }
    documentsByPrefix.set(collection.prefix, documents)
  }

  await mkdir(options.outputDirectory, { recursive: true })
  const files: IconSearchRuntimeManifest['files'] = []
  for (const [prefix, documents] of documentsByPrefix) {
    const jsonl = `${documents.map((document) => JSON.stringify(document)).join('\n')}\n`
    const compressed = gzipSync(jsonl, { level: 9 })
    const path = `${prefix}.jsonl.gz`
    await writeFile(join(options.outputDirectory, path), compressed)
    files.push({
      path,
      checksum: checksum(compressed),
      documents: documents.length,
      bytes: compressed.byteLength,
    })
  }
  const indexVersion = deriveIconSearchIndexVersion({
    iconPackageVersion: options.iconPackageVersion,
    searchDataVersion: options.maintained.dataVersion,
    rulesVersion: ICON_SEARCH_RULES_VERSION,
  })
  const manifest: IconSearchRuntimeManifest = {
    formatVersion: 1,
    iconPackageVersion: options.iconPackageVersion,
    searchDataVersion: options.maintained.dataVersion,
    rulesVersion: ICON_SEARCH_RULES_VERSION,
    indexVersion,
    counts: {
      definitions,
      aliases,
      documents: definitions + aliases,
      validEnglishRecords,
      validTranslations: 0,
      chineseDocuments: 0,
    },
    files,
  }
  await writeFile(
    join(options.outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return { manifest, excluded }
}

export async function readIconSearchManifest(
  directory: string,
): Promise<IconSearchRuntimeManifest> {
  const value: unknown = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  const parsed = runtimeManifestSchema.safeParse(value)
  if (!parsed.success) throw new Error('Invalid icon search manifest')
  const manifest = parsed.data
  if (manifest.rulesVersion !== ICON_SEARCH_RULES_VERSION) {
    throw new Error('Incompatible icon search manifest')
  }
  if (manifest.indexVersion !== deriveIconSearchIndexVersion(manifest)) {
    throw new Error('Icon search manifest index version mismatch')
  }
  const paths = new Set<string>()
  for (const file of manifest.files) {
    if (isAbsolute(file.path) || normalize(file.path).startsWith('..') || paths.has(file.path)) {
      throw new Error('Invalid icon search artifact path')
    }
    paths.add(file.path)
  }
  if (
    manifest.files.reduce((total, file) => total + file.documents, 0) !==
      manifest.counts.documents ||
    manifest.counts.definitions + manifest.counts.aliases !== manifest.counts.documents
  ) {
    throw new Error('Icon search manifest document count mismatch')
  }
  return manifest
}

export function getDefaultIconSearchArtifactDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  return import.meta.url.endsWith('.ts')
    ? join(moduleDirectory, '../../../../generated/icon-search')
    : join(moduleDirectory, 'icon-search')
}

export async function* iterateIconSearchArtifacts(
  directory: string,
  suppliedManifest?: IconSearchRuntimeManifest,
): AsyncGenerator<BuiltinIconSearchDocument> {
  const manifest = suppliedManifest ?? (await readIconSearchManifest(directory))
  let total = 0
  for (const file of manifest.files) {
    const compressed = await readFile(join(directory, file.path))
    if (checksum(compressed) !== file.checksum)
      throw new Error(`Icon search artifact checksum mismatch: ${file.path}`)
    if (compressed.byteLength !== file.bytes)
      throw new Error(`Icon search artifact size mismatch: ${file.path}`)
    const lines = gunzipSync(compressed).toString('utf8').split('\n').filter(Boolean)
    if (lines.length !== file.documents)
      throw new Error(`Icon search artifact count mismatch: ${file.path}`)
    total += lines.length
    for (const line of lines) {
      const document: unknown = JSON.parse(line)
      assertDocument(document)
      yield document
    }
  }
  if (total !== manifest.counts.documents)
    throw new Error('Icon search artifact total count mismatch')
}

export async function readIconSearchArtifacts(directory: string): Promise<{
  manifest: IconSearchRuntimeManifest
  documents: BuiltinIconSearchDocument[]
}> {
  const manifest = await readIconSearchManifest(directory)
  const documents: BuiltinIconSearchDocument[] = []
  for await (const document of iterateIconSearchArtifacts(directory, manifest))
    documents.push(document)
  return { manifest, documents }
}
