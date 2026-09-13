import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildIconSearchArtifacts,
  readIconSearchArtifacts,
  type IconPackageCollection,
  type MaintainedSearchData,
} from '../../../../src/modules/icons/search/artifacts'

const collection = (overrides: Partial<IconPackageCollection> = {}): IconPackageCollection => ({
  prefix: 'test',
  collection: 'Test Icons',
  palette: false,
  icons: ['alarm-clock', 'member'],
  hidden: ['hidden-item'],
  aliases: { 'old-alarm': { parent: 'alarm-clock' } },
  categories: { 'Account / User': ['member'] },
  ...overrides,
})

const maintained = (overrides: Partial<MaintainedSearchData> = {}): MaintainedSearchData => ({
  formatVersion: 1,
  iconPackageVersion: 'old-version-is-allowed',
  dataVersion: 'english-1',
  english: [
    { kind: 'icon', owner: 'test:alarm-clock', source: 'alarm-clock', terms: ['alarm', 'clock'] },
    {
      kind: 'category',
      owner: 'test:member',
      source: 'Account / User',
      terms: ['account', 'user'],
    },
  ],
  translations: [],
  ...overrides,
})

describe('icon search artifacts', () => {
  it('tracks package additions/removals without requiring maintenance coverage', async () => {
    const output = await mkdtemp(join(tmpdir(), 'icon-search-'))
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

  it('keeps category terms auxiliary and limits them to declared members', async () => {
    const output = await mkdtemp(join(tmpdir(), 'icon-search-'))
    await buildIconSearchArtifacts({
      collections: [collection()],
      iconPackageVersion: 'current',
      maintained: maintained(),
      outputDirectory: output,
    })

    const { documents } = await readIconSearchArtifacts(output)
    const member = documents.find((document) => document.id === 'test:member')!
    const alarm = documents.find((document) => document.id === 'test:alarm-clock')!
    expect(member.auxiliaryEnglishTerms).toEqual(
      expect.arrayContaining(['account', 'user', 'test', 'icons']),
    )
    expect(member.primaryEnglishTerms).not.toContain('account')
    expect(alarm.fullTokens).not.toContain('account')
    expect(alarm.exactPhrases).toEqual(['alarm-clock'])
  })

  it('fails when an alias cannot resolve', async () => {
    await expect(
      buildIconSearchArtifacts({
        collections: [collection({ aliases: { broken: { parent: 'missing' } } })],
        iconPackageVersion: 'current',
        maintained: maintained(),
        outputDirectory: await mkdtemp(join(tmpdir(), 'icon-search-')),
      }),
    ).rejects.toThrow('test:broken')
  })

  it('rejects corrupted runtime files', async () => {
    const output = await mkdtemp(join(tmpdir(), 'icon-search-'))
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

    await expect(readIconSearchArtifacts(output)).rejects.toThrow('checksum')
  })
})
