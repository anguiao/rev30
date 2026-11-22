import { appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadMaintainedSearchData } from '../../../../scripts/icon-search/build/maintenance'
import { fixtureCollection, temporaryDirectory, writeResourceFixture } from './resources-fixture'

describe('maintained icon search data', () => {
  it('loads the concept dictionary and verifies the official snapshots', async () => {
    const { directory } = await writeResourceFixture(await temporaryDirectory())
    const data = await loadMaintainedSearchData(directory, [fixtureCollection])

    expect(data.conceptsVersion).toBe('chinese-concepts-1')
    expect(data.concepts.byKey.get('闹钟')?.en).toEqual(['alarm-clock'])
    expect(data.official.checksums).toHaveLength(4)
    expect(data.official.forCollection(fixtureCollection)('block-seven')?.titles).toEqual([
      '俄罗斯方块',
    ])
  })

  it('rejects malformed and duplicate dictionary entries', async () => {
    const { directory, concepts } = await writeResourceFixture(await temporaryDirectory())
    const validate = () => loadMaintainedSearchData(directory, [fixtureCollection])
    const words = join(concepts, 'words.json')
    await writeFile(words, '[{"zh":["闹钟"]}]')
    await expect(validate()).rejects.toThrow(
      'At least one en, exactNames or intentEn target is required',
    )

    await writeFile(words, '[{"zh":["闹钟","闹 钟"],"en":["alarm-clock"]}]')
    await expect(validate()).rejects.toThrow('Duplicate key in words.json: 闹钟')
  })

  it('rejects concept targets that only occur in the collection metadata', async () => {
    const { directory, concepts } = await writeResourceFixture(await temporaryDirectory())
    await writeFile(join(concepts, 'intent.json'), '[{"zh":["测试"],"intentEn":["fixture"]}]')

    await expect(loadMaintainedSearchData(directory, [fixtureCollection])).rejects.toThrow(
      '测试.intentEn: fixture',
    )
  })

  it('rejects an incompatible maintenance manifest or modified official bytes', async () => {
    const { directory, manifest, official } = await writeResourceFixture(await temporaryDirectory())
    const validate = () => loadMaintainedSearchData(directory, [fixtureCollection])
    const path = join(directory, 'manifest.json')
    await writeFile(path, JSON.stringify({ ...manifest, formatVersion: 2 }))
    await expect(validate()).rejects.toThrow('Invalid icon search resource manifest')

    await writeFile(path, JSON.stringify(manifest))
    await appendFile(join(official, 'icon-park.json'), ' ')
    await expect(validate()).rejects.toThrow('Official snapshot checksum mismatch')
  })
})
