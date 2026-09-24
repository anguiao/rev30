import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it, onTestFinished } from 'vitest'

import { buildIconSearchArtifacts } from '../../../../scripts/icon-search/build/generate-artifacts'
import { readIconSearchArtifacts } from '../../../fixtures/icon-search'
import type { MaintainedSearchData } from '../../../../scripts/icon-search/build/maintenance'
import type { IconPackageCollection } from '../../../../scripts/icon-search/build/package-source'

const collection = (overrides: Partial<IconPackageCollection> = {}): IconPackageCollection => ({
  prefix: 'test',
  collection: 'Test Icons',
  palette: false,
  icons: ['alarm-clock', 'member'],
  hidden: ['hidden-item'],
  aliases: { 'old-alarm': { parent: 'alarm-clock' } },
  categories: { 'Account / User': ['hidden-item', 'member'] },
  ...overrides,
})

const maintained = (overrides: Partial<MaintainedSearchData> = {}): MaintainedSearchData => ({
  formatVersion: 2,
  iconPackageVersion: 'old-version-is-allowed',
  dataVersion: 'translations-1',
  translations: [
    { kind: 'icon', owner: 'test:alarm-clock', source: 'alarm-clock', translations: ['闹钟'] },
    { kind: 'icon', owner: 'test:alarm-clock', source: 'clock', translations: ['时钟'] },
    {
      kind: 'category',
      owner: { prefix: 'test', category: 'Account / User' },
      source: 'account',
      translations: ['账户'],
    },
    {
      kind: 'category',
      owner: { prefix: 'test', category: 'Account / User' },
      source: 'user',
      translations: ['用户'],
    },
  ],
  ...overrides,
})

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'icon-search-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

describe('icon search artifacts', () => {
  it('changes index identity when effective translations change without a manual version bump', async () => {
    const output = await temporaryDirectory()
    const first = await buildIconSearchArtifacts({
      collections: [collection()],
      iconPackageVersion: 'current',
      maintained: maintained(),
      outputDirectory: output,
    })
    const second = await buildIconSearchArtifacts({
      collections: [collection()],
      iconPackageVersion: 'current',
      maintained: maintained({
        translations: [
          {
            kind: 'icon',
            owner: 'test:alarm-clock',
            source: 'alarm-clock',
            translations: ['闹铃'],
          },
        ],
      }),
      outputDirectory: output,
    })
    expect(second.manifest.searchDataVersion).toBe(first.manifest.searchDataVersion)
    expect(second.manifest.indexVersion).not.toBe(first.manifest.indexVersion)
    const loaded = await readIconSearchArtifacts(output)
    expect(loaded.documents.find((entry) => entry.id === 'test:alarm-clock')?.fullTokens).toContain(
      '闹铃',
    )
  })

  it('keeps the logical index identity when only compression changes', async () => {
    const output = await temporaryDirectory()
    const { manifest } = await buildIconSearchArtifacts({
      collections: [collection()],
      iconPackageVersion: 'current',
      maintained: maintained(),
      outputDirectory: output,
    })
    const file = manifest.files[0]!
    const path = join(output, file.path)
    const compressed = gzipSync(gunzipSync(await readFile(path)), { level: 1 })
    file.checksum = createHash('sha256').update(compressed).digest('hex')
    file.bytes = compressed.byteLength
    await writeFile(path, compressed)
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest))
    const loaded = await readIconSearchArtifacts(output)
    expect(loaded.manifest.indexVersion).toBe(manifest.indexVersion)
    expect(loaded.documents).toHaveLength(manifest.counts.documents)
  })

  it('tracks package additions/removals without requiring maintenance coverage', async () => {
    const output = await temporaryDirectory()
    const result = await buildIconSearchArtifacts({
      collections: [
        collection({
          icons: ['new-icon'],
          hidden: [],
          aliases: { 'new-alias': { parent: 'new-icon' } },
        }),
      ],
      iconPackageVersion: 'current',
      maintained: maintained(),
      outputDirectory: output,
    })

    expect(result.manifest.counts).toMatchObject({ definitions: 1, aliases: 1, documents: 2 })
    expect(result.excluded.map((entry) => entry.owner)).toContain('test:alarm-clock')
    const loaded = await readIconSearchArtifacts(output)
    expect(loaded.documents.map((document) => document.id)).toEqual([
      'test:new-alias',
      'test:new-icon',
    ])
  })

  it('derives icon and category translations with their original field weights', async () => {
    const output = await temporaryDirectory()
    await buildIconSearchArtifacts({
      collections: [collection()],
      iconPackageVersion: 'current',
      maintained: maintained(),
      outputDirectory: output,
    })

    const { documents } = await readIconSearchArtifacts(output)
    const member = documents.find((document) => document.id === 'test:member')!
    const hidden = documents.find((document) => document.id === 'test:hidden-item')!
    const alarm = documents.find((document) => document.id === 'test:alarm-clock')!
    expect(member.auxiliaryEnglishTerms).toEqual(
      expect.arrayContaining(['account', 'user', 'test', 'icons']),
    )
    expect(member.primaryEnglishTerms).not.toContain('account')
    expect(member.fullTokens).toEqual(expect.arrayContaining(['账户', '用户']))
    expect(member.exactPhrases).not.toContain('账户')
    expect(hidden.fullTokens).toEqual(expect.arrayContaining(['账户', '用户']))
    expect(alarm.fullTokens).not.toContain('account')
    expect(alarm.fullTokens).toEqual(expect.arrayContaining(['闹钟', '时钟']))
    expect(alarm.exactPhrases).toEqual(['alarm-clock', '闹钟'])
  })

  it('fails when an alias cannot resolve', async () => {
    await expect(
      buildIconSearchArtifacts({
        collections: [collection({ aliases: { broken: { parent: 'missing' } } })],
        iconPackageVersion: 'current',
        maintained: maintained(),
        outputDirectory: await temporaryDirectory(),
      }),
    ).rejects.toThrow('test:broken')
  })

  it('uses every collection category while keeping translations and aliases bound to explicit members', async () => {
    const output = await temporaryDirectory()
    await buildIconSearchArtifacts({
      collections: [
        collection({
          aliases: {
            'listed-alias': { parent: 'member' },
            'unlisted-alias': { parent: 'member' },
          },
          categories: { 'Account / User': ['hidden-item', 'member', 'listed-alias'] },
        }),
        collection({ prefix: 'other' }),
      ],
      iconPackageVersion: 'current',
      maintained: maintained(),
      outputDirectory: output,
    })

    const { documents } = await readIconSearchArtifacts(output)
    const byId = new Map(documents.map((document) => [document.id, document]))
    for (const name of ['hidden-item', 'member', 'listed-alias']) {
      const document = byId.get(`test:${name}`)!
      expect(document.fullTokens).toEqual(
        expect.arrayContaining(['account', 'user', '账户', '用户']),
      )
      expect(document.primaryTokens).not.toContain('用户')
      expect(document.exactPhrases).not.toContain('用户')
    }
    const unlistedAlias = byId.get('test:unlisted-alias')!
    expect(unlistedAlias.fullTokens).not.toContain('account')
    expect(unlistedAlias.fullTokens).not.toContain('用户')
    const otherMember = byId.get('other:member')!
    expect(otherMember.auxiliaryEnglishTerms).toEqual(expect.arrayContaining(['account', 'user']))
    expect(otherMember.fullTokens).not.toContain('用户')
    expect(byId.get('other:alarm-clock')!.fullTokens).not.toContain('account')
  })

  it('counts Chinese documents from final Han tokens', async () => {
    const output = await temporaryDirectory()
    const result = await buildIconSearchArtifacts({
      collections: [collection()],
      iconPackageVersion: 'current',
      maintained: maintained({
        translations: [
          {
            kind: 'icon',
            owner: 'test:alarm-clock',
            source: 'alarm-clock',
            translations: ['alarm clock'],
          },
        ],
      }),
      outputDirectory: output,
    })
    expect(result.manifest.counts).toMatchObject({ validTranslations: 1, chineseDocuments: 0 })
  })

  it('rejects corrupted runtime files', async () => {
    const output = await temporaryDirectory()
    await buildIconSearchArtifacts({
      collections: [collection()],
      iconPackageVersion: 'current',
      maintained: maintained(),
      outputDirectory: output,
    })
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as {
      files: { path: string }[]
    }
    await writeFile(join(output, manifest.files[0]!.path), 'corrupt')

    await expect(readIconSearchArtifacts(output)).rejects.toThrow()
  })

  it('rejects changed documents even when their compressed file checksum is updated', async () => {
    const output = await temporaryDirectory()
    const { manifest } = await buildIconSearchArtifacts({
      collections: [collection()],
      iconPackageVersion: 'current',
      maintained: maintained(),
      outputDirectory: output,
    })
    const file = manifest.files[0]!
    const path = join(output, file.path)
    const text = gunzipSync(await readFile(path))
      .toString('utf8')
      .replaceAll('闹钟', '闹铃')
    const compressed = gzipSync(text)
    file.checksum = createHash('sha256').update(compressed).digest('hex')
    file.bytes = compressed.byteLength
    await writeFile(path, compressed)
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest))
    await expect(readIconSearchArtifacts(output)).rejects.toThrow('content fingerprint mismatch')
  })
})
