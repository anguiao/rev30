import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveIconSearchDocument } from '../document'
import { deriveSearchText } from '../text'
import { ICON_SEARCH_RULES_VERSION } from '../version'
import {
  checksum,
  deriveIconSearchIndexVersion,
  validateMaintainedSearchData,
  type IconPackageCollection,
  type MaintainedEnglishRecord,
  type MaintainedIconTranslationRecord,
  type MaintainedCategoryTranslationRecord,
  type MaintainedSearchData,
  type BuiltinIconSearchDocument,
  type IconSearchRuntimeManifest,
  type ExcludedMaintainedRecord,
} from './schema'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
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
  const collectionByPrefix = new Map(options.collections.map((entry) => [entry.prefix, entry]))
  const collectionNamesByPrefix = new Map(
    options.collections.map((collection) => [
      collection.prefix,
      new Set([
        ...collection.icons,
        ...(collection.hidden ?? []),
        ...Object.keys(collection.aliases),
      ]),
    ]),
  )
  const englishByIcon = new Map<string, MaintainedEnglishRecord[]>()
  const categoriesByIcon = new Map<string, MaintainedEnglishRecord[]>()
  const translationsByIcon = new Map<string, MaintainedIconTranslationRecord[]>()
  const translationsByCategory = new Map<string, MaintainedCategoryTranslationRecord[]>()
  let validEnglishRecords = 0
  let validTranslations = 0
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
    const iconNames = collectionNamesByPrefix.get(prefix) ?? new Set<string>()
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
    if (record.kind === 'icon') {
      const colon = record.owner.indexOf(':')
      const prefix = colon < 0 ? '' : record.owner.slice(0, colon)
      const name = colon < 0 ? '' : record.owner.slice(colon + 1)
      const names = collectionNamesByPrefix.get(prefix) ?? new Set<string>()
      const nameText = deriveSearchText(name)
      const sourceText = deriveSearchText(record.source)
      const validSource =
        sourceText.phrase === nameText.phrase ||
        (sourceText.tokens.length === 1 && nameText.tokens.includes(sourceText.phrase))
      if (!names.has(name) || !validSource) {
        excluded.push({
          kind: 'translation',
          owner: record.owner,
          source: record.source,
          reason: 'stale owner or source',
        })
        continue
      }
      validTranslations += record.translations.length
      translationsByIcon.set(record.owner, [
        ...(translationsByIcon.get(record.owner) ?? []),
        record,
      ])
      continue
    }

    const collection = collectionByPrefix.get(record.owner.prefix)
    const categoryText = deriveSearchText(record.owner.category)
    const sourceText = deriveSearchText(record.source)
    const validSource =
      sourceText.phrase === categoryText.phrase ||
      (sourceText.tokens.length === 1 && categoryText.tokens.includes(sourceText.phrase))
    const hasMaintainedRelationship = [...categoriesByIcon.values()].some((entries) =>
      entries.some(
        (entry) =>
          entry.owner.startsWith(`${record.owner.prefix}:`) &&
          entry.source === record.owner.category,
      ),
    )
    if (
      !collection?.categories?.[record.owner.category] ||
      !validSource ||
      !hasMaintainedRelationship
    ) {
      excluded.push({
        kind: 'translation',
        owner: record.owner,
        source: record.source,
        reason: 'stale category owner, source, or relationship',
      })
      continue
    }
    validTranslations += record.translations.length
    const key = `${record.owner.prefix}\0${record.owner.category}`
    translationsByCategory.set(key, [...(translationsByCategory.get(key) ?? []), record])
  }

  let chineseDocuments = 0
  await mkdir(options.outputDirectory, { recursive: true })
  const files: IconSearchRuntimeManifest['files'] = []
  const contentHash = createHash('sha256')
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
      const iconTranslations = translationsByIcon.get(`${collection.prefix}:${name}`) ?? []
      const categoryTranslations = categoryEntries.flatMap(
        (entry) => translationsByCategory.get(`${collection.prefix}\0${entry.source}`) ?? [],
      )
      const document = deriveIconSearchDocument({
        id: `${collection.prefix}:${name}`,
        prefix: collection.prefix,
        name,
        source: 'builtin',
        collection: collection.collection,
        palette: collection.palette,
        customIconId: null,
        primaryPhrases: [
          name,
          ...maintainedTerms,
          ...iconTranslations.flatMap((entry) => entry.translations),
        ],
        auxiliaryPhrases: [
          collection.prefix,
          collection.collection,
          ...categoryEntries.flatMap((entry) => [entry.source, ...entry.terms]),
          ...categoryTranslations.flatMap((entry) => entry.translations),
        ],
        exactPhrases: [
          name,
          ...iconTranslations
            .filter(
              (entry) => deriveSearchText(entry.source).phrase === deriveSearchText(name).phrase,
            )
            .flatMap((entry) => entry.translations),
        ],
      }) as BuiltinIconSearchDocument
      documents.push(document)
      if (document.fullTokens.some((token) => /\p{Script=Han}/u.test(token))) chineseDocuments++
    }
    const jsonl = `${documents.map((document) => JSON.stringify(document)).join('\n')}\n`
    const compressed = gzipSync(jsonl, { level: 9 })
    const path = `${collection.prefix}.jsonl.gz`
    contentHash.update(`${path}\0`).update(jsonl)
    await writeFile(join(options.outputDirectory, path), compressed)
    files.push({
      path,
      checksum: checksum(compressed),
      documents: documents.length,
      bytes: compressed.byteLength,
    })
  }
  const contentFingerprint = contentHash.digest('hex')
  const indexVersion = deriveIconSearchIndexVersion({
    iconPackageVersion: options.iconPackageVersion,
    searchDataVersion: options.maintained.dataVersion,
    rulesVersion: ICON_SEARCH_RULES_VERSION,
    contentFingerprint,
  })
  const manifest: IconSearchRuntimeManifest = {
    formatVersion: 2,
    iconPackageVersion: options.iconPackageVersion,
    searchDataVersion: options.maintained.dataVersion,
    rulesVersion: ICON_SEARCH_RULES_VERSION,
    indexVersion,
    contentFingerprint,
    counts: {
      definitions,
      aliases,
      documents: definitions + aliases,
      validEnglishRecords,
      validTranslations,
      chineseDocuments,
    },
    files,
  }
  await writeFile(
    join(options.outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return { manifest, excluded }
}
