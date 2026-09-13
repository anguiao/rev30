import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadMaintainedSearchData } from '../../../../src/modules/icons/search/maintenance'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

async function writeFixture(content: string, checksum = hash(content)) {
  const directory = await mkdtemp(join(tmpdir(), 'icon-search-maintenance-'))
  await mkdir(join(directory, 'english'))
  await writeFile(join(directory, 'english/test.jsonl'), content)
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      iconPackageVersion: 'older',
      dataVersion: 'english-1',
      files: [{ kind: 'english', path: 'english/test.jsonl', checksum }],
    }),
  )
  return directory
}

describe('maintained icon search data', () => {
  it('loads a partial data set whose source package version is older', async () => {
    const line = `${JSON.stringify({ kind: 'icon', owner: 'test:alarm', source: 'alarm', terms: ['alarm'] })}\n`
    const result = await loadMaintainedSearchData(await writeFixture(line))
    expect(result).toMatchObject({ iconPackageVersion: 'older', dataVersion: 'english-1' })
    expect(result.english).toHaveLength(1)
  })

  it('fails for damaged or conflicting maintenance files', async () => {
    const line = `${JSON.stringify({ kind: 'icon', owner: 'test:alarm', source: 'alarm', terms: ['alarm'] })}\n`
    await expect(
      loadMaintainedSearchData(await writeFixture(line, '0'.repeat(64))),
    ).rejects.toThrow('checksum')

    const duplicateDirectory = await writeFixture(`${line}${line}`)
    await expect(loadMaintainedSearchData(duplicateDirectory)).rejects.toThrow('Duplicate')

    const wrongRecord = `${JSON.stringify({ kind: 'icon', owner: 'test:alarm', source: 'alarm', translations: ['闹钟'] })}\n`
    await expect(loadMaintainedSearchData(await writeFixture(wrongRecord))).rejects.toThrow(
      'Invalid English record',
    )
  })
})
