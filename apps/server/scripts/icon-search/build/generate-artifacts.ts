import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveIconSearchDocument } from '../../../src/modules/icons/search/document'
import type {
  MaintainedIconTranslationRecord,
  MaintainedCategoryTranslationRecord,
  MaintainedSearchData,
} from './maintenance'
import type { IconPackageCollection } from './package-source'
import { deriveSearchText } from '../../../src/modules/icons/search/text'
import { ICON_SEARCH_RULES_VERSION } from '../../../src/modules/icons/search/rules'
import {
  checksum,
  deriveIconSearchIndexVersion,
  type IconSearchArtifactDocument,
  type IconSearchRuntimeManifest,
} from '../../../src/modules/icons/search/artifacts/schema'

type ExcludedMaintainedRecord = {
  kind: 'translation'
  owner: string | MaintainedCategoryTranslationRecord['owner']
  source: string
  reason: string
}

type TranslationIndex = {
  icons: Map<string, MaintainedIconTranslationRecord[]>
  categories: Map<string, MaintainedCategoryTranslationRecord[]>
}

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

function matchesTranslationSource(owner: string, source: string) {
  const ownerText = deriveSearchText(owner)
  const sourceText = deriveSearchText(source)
  return (
    sourceText.phrase === ownerText.phrase ||
    (sourceText.tokens.length === 1 && ownerText.tokens.includes(sourceText.phrase))
  )
}

function indexTranslations(
  collections: IconPackageCollection[],
  translations: MaintainedSearchData['translations'],
) {
  const excluded: ExcludedMaintainedRecord[] = []
  const collectionByPrefix = new Map<string, IconPackageCollection>()
  const collectionNamesByPrefix = new Map<string, Set<string>>()
  const icons = new Map<string, MaintainedIconTranslationRecord[]>()
  const categories = new Map<string, MaintainedCategoryTranslationRecord[]>()
  let validTranslations = 0

  for (const collection of collections) {
    if (collectionByPrefix.has(collection.prefix))
      throw new Error(`Duplicate icon collection: ${collection.prefix}`)
    collectionByPrefix.set(collection.prefix, collection)
    const definitionNames = [...collection.icons, ...(collection.hidden ?? [])]
    if (new Set(definitionNames).size !== definitionNames.length) {
      throw new Error(`Duplicate icon definition in ${collection.prefix}`)
    }
    for (const alias of Object.keys(collection.aliases)) {
      if (definitionNames.includes(alias))
        throw new Error(`Icon and alias conflict: ${collection.prefix}:${alias}`)
    }
    collectionNamesByPrefix.set(
      collection.prefix,
      new Set([...definitionNames, ...Object.keys(collection.aliases)]),
    )
  }

  for (const record of translations) {
    if (record.kind === 'icon') {
      const colon = record.owner.indexOf(':')
      const prefix = colon < 0 ? '' : record.owner.slice(0, colon)
      const name = colon < 0 ? '' : record.owner.slice(colon + 1)
      const names = collectionNamesByPrefix.get(prefix)
      if (!names?.has(name) || !matchesTranslationSource(name, record.source)) {
        excluded.push({
          kind: 'translation',
          owner: record.owner,
          source: record.source,
          reason: 'stale owner or source',
        })
        continue
      }
      validTranslations += record.translations.length
      icons.set(record.owner, [...(icons.get(record.owner) ?? []), record])
      continue
    }

    const collection = collectionByPrefix.get(record.owner.prefix)
    if (
      !collection?.categories?.[record.owner.category] ||
      !matchesTranslationSource(record.owner.category, record.source)
    ) {
      excluded.push({
        kind: 'translation',
        owner: record.owner,
        source: record.source,
        reason: 'stale category owner or source',
      })
      continue
    }
    validTranslations += record.translations.length
    const key = `${record.owner.prefix}\0${record.owner.category}`
    categories.set(key, [...(categories.get(key) ?? []), record])
  }

  return { icons, categories, excluded, validTranslations }
}

function deriveCollectionDocuments(
  collection: IconPackageCollection,
  translations: TranslationIndex,
): IconSearchArtifactDocument[] {
  const iconSet = new Set([...collection.icons, ...(collection.hidden ?? [])])
  for (const alias of Object.keys(collection.aliases)) {
    if (!resolveAlias(alias, iconSet, collection.aliases))
      throw new Error(`Cannot resolve alias ${collection.prefix}:${alias}`)
  }

  const categoriesByName = new Map<string, string[]>()
  for (const [category, members] of Object.entries(collection.categories ?? {})) {
    for (const member of members) {
      const categories = categoriesByName.get(member)
      if (categories) categories.push(category)
      else categoriesByName.set(member, [category])
    }
  }

  const names = [...iconSet, ...Object.keys(collection.aliases)].sort(compareText)
  return names.map((name) => {
    const categories = categoriesByName.get(name) ?? []
    const iconTranslations = translations.icons.get(`${collection.prefix}:${name}`) ?? []
    const categoryTranslations = categories.flatMap(
      (category) => translations.categories.get(`${collection.prefix}\0${category}`) ?? [],
    )
    const namePhrase = deriveSearchText(name).phrase
    return deriveIconSearchDocument({
      id: `${collection.prefix}:${name}`,
      prefix: collection.prefix,
      name,
      source: 'builtin',
      collection: collection.collection,
      palette: collection.palette,
      customIconId: null,
      primaryPhrases: [name, ...iconTranslations.flatMap((entry) => entry.translations)],
      auxiliaryPhrases: [
        collection.prefix,
        collection.collection,
        ...categories,
        ...categoryTranslations.flatMap((entry) => entry.translations),
      ],
      exactPhrases: [
        name,
        ...iconTranslations
          .filter((entry) => deriveSearchText(entry.source).phrase === namePhrase)
          .flatMap((entry) => entry.translations),
      ],
    }) as IconSearchArtifactDocument
  })
}

export async function buildIconSearchArtifacts(options: {
  collections: IconPackageCollection[]
  iconPackageVersion: string
  maintained: MaintainedSearchData
  outputDirectory: string
}): Promise<{ manifest: IconSearchRuntimeManifest; excluded: ExcludedMaintainedRecord[] }> {
  const translations = indexTranslations(options.collections, options.maintained.translations)
  const files: IconSearchRuntimeManifest['files'] = []
  const contentHash = createHash('sha256')
  let definitions = 0
  let aliases = 0
  let chineseDocuments = 0

  await mkdir(options.outputDirectory, { recursive: true })
  for (const collection of [...options.collections].sort((a, b) =>
    compareText(a.prefix, b.prefix),
  )) {
    const documents = deriveCollectionDocuments(collection, translations)
    definitions += collection.icons.length + (collection.hidden?.length ?? 0)
    aliases += Object.keys(collection.aliases).length
    for (const document of documents) {
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
    formatVersion: 5,
    iconPackageVersion: options.iconPackageVersion,
    searchDataVersion: options.maintained.dataVersion,
    rulesVersion: ICON_SEARCH_RULES_VERSION,
    indexVersion,
    contentFingerprint,
    counts: {
      definitions,
      aliases,
      documents: definitions + aliases,
      validTranslations: translations.validTranslations,
      chineseDocuments,
    },
    files,
  }
  await writeFile(
    join(options.outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return { manifest, excluded: translations.excluded }
}
