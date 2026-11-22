import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildIconSearchArtifacts } from '../../../../scripts/icon-search/build/generate-artifacts'
import { officialSnapshotNames } from '../../../../scripts/icon-search/official/manifest'
import {
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../../../src/modules/icons/search/artifacts/reader'
import {
  checksum,
  type IconSearchArtifactDocument,
} from '../../../../src/modules/icons/search/artifacts/schema'
import { fixtureCollection, temporaryDirectory, writeResourceFixture } from './resources-fixture'

async function setupBuild() {
  const directory = await temporaryDirectory()
  const resourcesDirectory = join(directory, 'resources')
  const resources = await writeResourceFixture(resourcesDirectory)
  const options = {
    collections: [fixtureCollection],
    iconPackageVersion: 'current',
    resourcesDirectory,
    outputDirectory: join(directory, 'output'),
  }

  return { options, resources, build: () => buildIconSearchArtifacts(options) }
}

async function readDocuments(directory: string) {
  const manifest = await readIconSearchManifest(directory)
  const documents: IconSearchArtifactDocument[] = []
  for await (const document of iterateIconSearchArtifacts(directory, manifest)) {
    documents.push(document)
  }
  return documents
}

async function alterArtifact(directory: string, alter: (text: string, lines: string[]) => string) {
  const manifest = await readIconSearchManifest(directory)
  const descriptor = manifest.files[0]!
  const path = join(directory, descriptor.path)
  const text = gunzipSync(await readFile(path)).toString('utf8')
  const compressed = gzipSync(alter(text, text.trimEnd().split('\n')), { level: 1 })
  descriptor.checksum = checksum(compressed)
  descriptor.bytes = compressed.byteLength
  await writeFile(path, compressed)
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
}

describe('icon search artifacts', () => {
  it('writes format 6 builtin facts with official titles, related tags and ordered names', async () => {
    const { build, options, resources } = await setupBuild()
    options.collections.unshift({ ...fixtureCollection, prefix: 'icon-park' })
    options.collections.reverse()

    const { manifest } = await build()

    expect(manifest).toMatchObject({
      formatVersion: 6,
      iconPackageVersion: 'current',
      indexRulesVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
      officialChecksums: officialSnapshotNames.map(
        (name) => resources.manifest.official[name]!.checksum,
      ),
      counts: { definitions: 8, aliases: 2, documents: 10, chineseDocuments: 2 },
    })
    expect(manifest.files.map(({ path }) => path)).toEqual([
      'icon-park.jsonl.gz',
      'icon-park-outline.jsonl.gz',
    ])

    const documents = await readDocuments(options.outputDirectory)
    const byId = new Map(documents.map((document) => [document.id, document]))
    const names = ['alarm-clock', 'block-seven', 'hidden-item', 'legacy-block', 'member']
    expect(documents.map(({ id }) => id)).toEqual(
      ['icon-park', 'icon-park-outline'].flatMap((prefix) =>
        names.map((name) => `${prefix}:${name}`),
      ),
    )
    expect(byId.get('icon-park-outline:block-seven')).toMatchObject({
      category: 'ui',
      exactKeys: ['block-seven', '俄罗斯方块'],
      primaryTokens: ['block', 'seven', '俄罗斯方块'],
      relatedTokens: ['拼接'],
      primaryNameText: 'block seven',
      keywordText: '',
    })
    expect(byId.get('icon-park-outline:hidden-item')).toMatchObject({
      categoryText: 'account user',
      primaryNameText: 'hidden item',
    })
    expect(byId.get('icon-park-outline:legacy-block')).toMatchObject({
      exactKeys: ['legacy-block'],
      relatedTokens: [],
      categoryText: '',
    })
  })

  it('ships the verified concepts independently of the index identity and artifact files', async () => {
    const { build, options, resources } = await setupBuild()
    const { manifest: first } = await build()
    const dictionary = '[{"zh":["闹铃"],"en":["alarm-clock"]}]'
    await Promise.all([
      writeFile(join(resources.concepts, 'words.json'), dictionary),
      writeFile(
        join(resources.directory, 'manifest.json'),
        JSON.stringify({ ...resources.manifest, conceptsVersion: 'chinese-concepts-2' }),
      ),
    ])

    const { manifest: second } = await build()

    expect(second).toEqual(first)
    await expect(
      readFile(join(options.outputDirectory, 'concepts/words.json'), 'utf8'),
    ).resolves.toBe(dictionary)
    expect(second.files.some(({ path }) => path.startsWith('concepts/'))).toBe(false)
  })

  it('changes index identity when an unused official snapshot changes', async () => {
    const { build, resources } = await setupBuild()
    const { manifest: first } = await build()
    const name = 'iso-flags.json'
    const changed = '{"cn":["中国"]}'
    await Promise.all([
      writeFile(join(resources.official, name), changed),
      writeFile(
        join(resources.directory, 'manifest.json'),
        JSON.stringify({
          ...resources.manifest,
          official: {
            ...resources.manifest.official,
            [name]: { ...resources.manifest.official[name], checksum: checksum(changed) },
          },
        }),
      ),
    ])

    const { manifest: second } = await build()

    expect(second.indexVersion).not.toBe(first.indexVersion)
    expect(second.contentFingerprint).toBe(first.contentFingerprint)
    expect(second.files).toEqual(first.files)
  })

  it('retains the last valid output when concept validation or document generation fails', async () => {
    const { build, options, resources } = await setupBuild()
    const { manifest } = await build()
    const words = join(resources.concepts, 'words.json')
    await writeFile(words, '[{"zh":["无效"],"en":["fixture"]}]')
    await expect(build()).rejects.toThrow('无效.en: fixture')
    await expect(readIconSearchManifest(options.outputDirectory)).resolves.toEqual(manifest)

    await writeFile(words, '[]')
    options.collections.push({
      ...fixtureCollection,
      prefix: 'z-test',
      aliases: { broken: { parent: 'missing' } },
    })
    await expect(build()).rejects.toThrow('Cannot resolve alias z-test:broken')
    await expect(readIconSearchManifest(options.outputDirectory)).resolves.toEqual(manifest)
    await expect(readDocuments(options.outputDirectory)).resolves.toHaveLength(5)
  })

  it('keeps the index identity when only compression changes', async () => {
    const { build, options } = await setupBuild()
    const { manifest } = await build()

    await alterArtifact(options.outputDirectory, (text) => text)

    await expect(readIconSearchManifest(options.outputDirectory)).resolves.toMatchObject({
      indexVersion: manifest.indexVersion,
    })
    await expect(readDocuments(options.outputDirectory)).resolves.toHaveLength(5)
  })

  it.each([
    [
      'malformed document',
      (text: string) => text.replace('"category":"ui"', '"category":"bad"'),
      /invalid.*document/i,
    ],
    [
      'wrong owner',
      (text: string) => text.replaceAll('icon-park-outline', 'foreign'),
      /identity mismatch/i,
    ],
    [
      'unsorted names',
      (_: string, lines: string[]) => lines.reverse().join('\n') + '\n',
      /document order/i,
    ],
    [
      'changed document content',
      (text: string) => text.replaceAll('俄罗斯方块', '方块游戏'),
      /content fingerprint mismatch/i,
    ],
  ])('rejects %s with an updated compressed checksum', async (_, alter, error) => {
    const { build, options } = await setupBuild()
    await build()
    await alterArtifact(options.outputDirectory, alter)

    await expect(readDocuments(options.outputDirectory)).rejects.toThrow(error)
  })

  it('checks compressed bytes, checksum and actual document counts', async () => {
    const { build, options } = await setupBuild()
    const { manifest } = await build()
    const file = manifest.files[0]!
    const path = join(options.outputDirectory, 'manifest.json')

    await writeFile(
      path,
      JSON.stringify({ ...manifest, files: [{ ...file, checksum: '0'.repeat(64) }] }),
    )
    await expect(readDocuments(options.outputDirectory)).rejects.toThrow('checksum mismatch')
    await writeFile(
      path,
      JSON.stringify({ ...manifest, files: [{ ...file, bytes: file.bytes + 1 }] }),
    )
    await expect(readDocuments(options.outputDirectory)).rejects.toThrow('size mismatch')
    await writeFile(
      path,
      JSON.stringify({
        ...manifest,
        counts: { ...manifest.counts, documents: 6, definitions: 5 },
        files: [{ ...file, documents: 6 }],
      }),
    )
    await expect(readDocuments(options.outputDirectory)).rejects.toThrow('count mismatch')
  })

  it('rejects an index version or collection path that is inconsistent with the manifest', async () => {
    const { build, options } = await setupBuild()
    const { manifest } = await build()
    const path = join(options.outputDirectory, 'manifest.json')

    await writeFile(path, JSON.stringify({ ...manifest, indexVersion: '0'.repeat(64) }))
    await expect(readIconSearchManifest(options.outputDirectory)).rejects.toThrow(
      'index version mismatch',
    )
    await writeFile(
      path,
      JSON.stringify({
        ...manifest,
        files: [{ ...manifest.files[0], path: 'concepts/words.json' }],
      }),
    )
    await expect(readIconSearchManifest(options.outputDirectory)).rejects.toThrow(
      'Invalid icon search manifest',
    )
  })
})
