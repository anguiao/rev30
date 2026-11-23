import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onTestFinished } from 'vitest'
import type { IconPackageCollection } from '../../../../scripts/icon-search/build/package-source'
import {
  officialSnapshotNames,
  type OfficialSnapshotName,
} from '../../../../scripts/icon-search/resource-manifest'
import { checksum } from '../../../../src/modules/icons/search/artifacts/schema'

export const fixtureCollection: IconPackageCollection = {
  prefix: 'icon-park-outline',
  collection: 'Fixture Icons',
  category: 'UI 24px',
  palette: false,
  icons: ['alarm-clock', 'block-seven', 'member'],
  hidden: ['hidden-item'],
  aliases: { 'legacy-block': { parent: 'block-seven' } },
  categories: { 'Account / User': ['member', 'hidden-item'] },
}

export async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'icon-search-build-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

export async function writeResourceFixture(directory: string) {
  const concepts = join(directory, 'concepts')
  const official = join(directory, 'official')
  await Promise.all([mkdir(concepts, { recursive: true }), mkdir(official, { recursive: true })])

  const source = {
    project: 'Fixture upstream',
    version: '1',
    url: 'https://example.invalid/fixture.json',
    checksum: checksum('source'),
  }
  const snapshots: Record<OfficialSnapshotName, string> = {
    'icon-park.json': JSON.stringify({
      'block-seven': { titles: ['俄罗斯方块'], tags: ['拼接'] },
    }),
    'remix-icon.json': '{}',
    'cldr-emoji.json': '{}',
    'iso-flags.json': '{}',
  }
  const manifest = {
    formatVersion: 3,
    conceptsVersion: 'chinese-concepts-1',
    official: Object.fromEntries(
      officialSnapshotNames.map((name) => [
        name,
        { checksum: checksum(snapshots[name]), sources: [source] },
      ]),
    ),
  }
  await Promise.all([
    ...officialSnapshotNames.map((name) => writeFile(join(official, name), snapshots[name])),
    writeFile(join(official, 'THIRD_PARTY_NOTICES.txt'), 'Fixture upstream license\n'),
    writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)),
    writeFile(join(concepts, 'words.json'), '[{"zh":["闹钟"],"en":["alarm-clock"]}]'),
    writeFile(join(concepts, 'phrases.json'), '[]'),
    writeFile(join(concepts, 'intent.json'), '[]'),
  ])
  return { manifest, directory, concepts, official, snapshots }
}
