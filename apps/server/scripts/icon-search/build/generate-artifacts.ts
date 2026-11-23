import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'

import {
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../../src/modules/icons/search/artifacts/reader'
import {
  artifactFileSchema,
  artifactFileSuffix,
  checksum,
  deriveIconSearchIndexVersion,
  hasArtifactChineseText,
  type IconSearchRuntimeManifest,
} from '../../../src/modules/icons/search/artifacts/schema'
import { ICON_SEARCH_INDEX_RULES_VERSION } from '../../../src/modules/icons/search/rules'
import type { OfficialIconSearchData } from '../official/load'
import { loadMaintainedSearchData } from './maintenance'
import { deriveCollectionSearchFacts } from './package-facts'
import type { IconPackageCollection } from './package-source'

type BuildOptions = {
  collections: readonly IconPackageCollection[]
  iconPackageVersion: string
  resourcesDirectory: string
  outputDirectory: string
}

async function writeArtifacts(
  directory: string,
  iconPackageVersion: string,
  collections: readonly IconPackageCollection[],
  official: OfficialIconSearchData,
) {
  const contentHash = createHash('sha256')
  const files: IconSearchRuntimeManifest['files'] = []
  let definitions = 0
  let aliases = 0
  let chineseDocuments = 0

  for (const collection of [...collections].sort((left, right) =>
    left.prefix < right.prefix ? -1 : left.prefix > right.prefix ? 1 : 0,
  )) {
    const path = `${collection.prefix}${artifactFileSuffix}`
    if (files.at(-1)?.path === path)
      throw new Error(`Duplicate icon collection: ${collection.prefix}`)

    const documents = deriveCollectionSearchFacts(collection, official)
    definitions += collection.icons.length + (collection.hidden?.length ?? 0)
    aliases += Object.keys(collection.aliases).length
    chineseDocuments += documents.filter(hasArtifactChineseText).length

    const jsonl = documents.map((document) => `${JSON.stringify(document)}\n`).join('')
    const compressed = gzipSync(jsonl, { level: 9 })
    const file = artifactFileSchema.parse({
      path,
      checksum: checksum(compressed),
      documents: documents.length,
      bytes: compressed.byteLength,
    })
    contentHash.update(`${file.path}\0`).update(jsonl)
    await writeFile(join(directory, file.path), compressed)
    files.push(file)
  }

  const versionInput = {
    iconPackageVersion,
    indexRulesVersion: ICON_SEARCH_INDEX_RULES_VERSION,
    contentFingerprint: contentHash.digest('hex'),
    officialChecksums: [...official.checksums],
  }
  const manifest: IconSearchRuntimeManifest = {
    formatVersion: 6,
    indexVersion: deriveIconSearchIndexVersion(versionInput),
    ...versionInput,
    counts: { definitions, aliases, documents: definitions + aliases, chineseDocuments },
    files,
  }
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function publishArtifacts(staging: string, output: string) {
  const previous = `${staging}-previous`
  let backedUp = false
  try {
    await rename(output, previous)
    backedUp = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  try {
    await rename(staging, output)
  } catch (error) {
    if (backedUp) {
      await rename(previous, output).catch((restoreError: unknown) => {
        throw new AggregateError(
          [error, restoreError],
          `Could not publish icon search artifacts. Previous artifacts are in ${previous}`,
        )
      })
    }
    throw error
  }
  if (backedUp) await rm(previous, { recursive: true, force: true })
}

export async function buildIconSearchArtifacts({
  collections,
  iconPackageVersion,
  resourcesDirectory,
  outputDirectory,
}: BuildOptions): Promise<{ manifest: IconSearchRuntimeManifest }> {
  const parent = dirname(outputDirectory)
  await mkdir(parent, { recursive: true })
  const staging = await mkdtemp(join(parent, '.icon-search-build-'))

  try {
    const conceptsDirectory = join(staging, 'concepts')
    await mkdir(conceptsDirectory)
    await Promise.all(
      ['words.json', 'phrases.json', 'intent.json'].map((name) =>
        copyFile(join(resourcesDirectory, 'concepts', name), join(conceptsDirectory, name)),
      ),
    )
    const { official } = await loadMaintainedSearchData(
      resourcesDirectory,
      collections,
      conceptsDirectory,
    )
    const notices = 'THIRD_PARTY_NOTICES.txt'
    await copyFile(join(resourcesDirectory, 'official', notices), join(staging, notices))
    await writeArtifacts(staging, iconPackageVersion, collections, official)

    const manifest = await readIconSearchManifest(staging)
    for await (const _document of iterateIconSearchArtifacts(staging, manifest)) {
      // Consume all records so the staged files are verified before replacing the previous build.
    }
    await publishArtifacts(staging, outputDirectory)
    return { manifest }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
