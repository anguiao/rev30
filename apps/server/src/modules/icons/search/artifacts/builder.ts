import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveIconSearchDocument } from '../document'
import type {
  MaintainedIconTranslationRecord,
  MaintainedCategoryTranslationRecord,
  MaintainedSearchData,
} from '../maintenance'
import type { IconPackageCollection } from '../package-source'
import { deriveSearchText } from '../text'
import { ICON_SEARCH_RULES_VERSION } from '../version'
import {
  checksum,
  deriveIconSearchIndexVersion,
  type BuiltinIconSearchDocument,
  type IconSearchRuntimeManifest,
} from './schema'

type ExcludedMaintainedRecord = {
  kind: 'translation'
  owner: string | MaintainedCategoryTranslationRecord['owner']
  source: string
  reason: string
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

export async function buildIconSearchArtifacts(options: {
  collections: IconPackageCollection[]
  iconPackageVersion: string
  maintained: MaintainedSearchData
  outputDirectory: string
}): Promise<{ manifest: IconSearchRuntimeManifest; excluded: ExcludedMaintainedRecord[] }> {
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
  const translationsByIcon = new Map<string, MaintainedIconTranslationRecord[]>()
  const translationsByCategory = new Map<string, MaintainedCategoryTranslationRecord[]>()
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
    if (!collection?.categories?.[record.owner.category] || !validSource) {
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

    const categoriesByName = new Map<string, string[]>()
    for (const [category, members] of Object.entries(collection.categories ?? {})) {
      for (const member of members) {
        const categories = categoriesByName.get(member)
        if (categories) categories.push(category)
        else categoriesByName.set(member, [category])
      }
    }

    const documents: BuiltinIconSearchDocument[] = []
    const names = [...iconSet, ...Object.keys(collection.aliases)].sort(compareText)
    for (const name of names) {
      const categories = categoriesByName.get(name) ?? []
      const iconTranslations = translationsByIcon.get(`${collection.prefix}:${name}`) ?? []
      const categoryTranslations = categories.flatMap(
        (category) => translationsByCategory.get(`${collection.prefix}\0${category}`) ?? [],
      )
      const document = deriveIconSearchDocument({
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
    formatVersion: 4,
    iconPackageVersion: options.iconPackageVersion,
    searchDataVersion: options.maintained.dataVersion,
    rulesVersion: ICON_SEARCH_RULES_VERSION,
    indexVersion,
    contentFingerprint,
    counts: {
      definitions,
      aliases,
      documents: definitions + aliases,
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
