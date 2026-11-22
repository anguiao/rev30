import { lookupCollection } from '@iconify/json'
import { appendFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'

import { loadOfficialIconSearchData } from '../../../../scripts/icon-search/official/load'

const resourcesDirectory = fileURLToPath(
  new URL('../../../../resources/icon-search', import.meta.url),
)

it('loads IconPark titles and separate RemixIcon search labels offline', async () => {
  const fetch = vi.fn(() => {
    throw new Error('Unexpected network access')
  })
  vi.stubGlobal('fetch', fetch)
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })

  const official = await loadOfficialIconSearchData(resourcesDirectory)
  expect(official.checksums).toHaveLength(4)
  for (const prefix of ['icon-park', 'icon-park-outline', 'icon-park-solid', 'icon-park-twotone']) {
    const lookup = official.forCollection({ prefix })
    expect(lookup('block-seven')?.titles).toEqual(['俄罗斯方块'])
    expect(lookup('block-seven')?.tags).toContain('拼接')
  }

  const remix = official.forCollection({ prefix: 'ri' })
  for (const name of ['file-line', 'file-fill']) {
    expect(remix(name)?.titles).toEqual([])
    expect(remix(name)?.tags).toContain('新建')
    expect(remix(name)?.tags).not.toContain('create')
  }
  expect(official.forCollection({ prefix: 'lucide' })('block-seven')).toBeUndefined()
  expect(official.forCollection({ prefix: 'lucide' })('file-line')).toBeUndefined()
  expect(fetch).not.toHaveBeenCalled()
})

it('uses CLDR short names and keywords for the exact Emoji character sequences', async () => {
  const official = await loadOfficialIconSearchData(resourcesDirectory)
  const { prefix, chars } = await lookupCollection('twemoji')
  const emoji = official.forCollection({ prefix, category: 'Emoji', chars })

  expect(emoji('computer-mouse')?.titles).toEqual(['电脑鼠标'])
  expect(emoji('computer-mouse')?.tags).toContain('鼠标')
  expect(emoji('waving-hand-light-skin-tone')?.titles).toEqual(['挥手: 较浅肤色'])
  expect(emoji('waving-hand-light-skin-tone')?.tags).toContain('再见')

  const emojiWithSelectors = official.forCollection({
    prefix,
    category: 'Emoji',
    chars: {
      '00a9-fe0f': 'copyright-sign',
      '2764-fe0f-200d-1f525': 'heart-with-fire',
      '2764-1f525': 'heart-without-joiner',
    },
  })
  expect(emojiWithSelectors('copyright-sign')?.titles).toEqual(['版权'])
  expect(emojiWithSelectors('heart-with-fire')?.titles).toEqual(['火上之心'])
  expect(emojiWithSelectors('heart-without-joiner')).toBeUndefined()
  expect(emojiWithSelectors('computer-mouse')).toBeUndefined()
  expect(
    official.forCollection({ prefix, category: 'UI 24px', chars })('computer-mouse'),
  ).toBeUndefined()
})

it('matches flag names and canvas variants to exact region codes and CLDR short names', async () => {
  const official = await loadOfficialIconSearchData(resourcesDirectory)
  const flag = official.forCollection({ prefix: 'flag' })
  const circle = official.forCollection({ prefix: 'circle-flags' })
  const flagpack = official.forCollection({ prefix: 'flagpack' })
  const cif = official.forCollection({ prefix: 'cif' })

  expect(flag('cn-1x1')).toEqual({ titles: ['中国'], tags: [] })
  expect(flag('cn-4x3')).toEqual(flag('cn-1x1'))
  expect(circle('cn')).toEqual(flag('cn-1x1'))
  expect(flagpack('jp')).toEqual({ titles: ['日本'], tags: [] })
  expect(cif('jp')).toEqual(flagpack('jp'))
  expect(cif('cif-jp')).toEqual(flagpack('jp'))
  expect(circle('hk')?.titles).toEqual(expect.arrayContaining(['中国香港特别行政区', '香港']))
  expect(flag('ea-4x3')?.titles).toEqual(['休达及梅利利亚'])
  expect(flag('gb-eng-4x3')).toBeUndefined()
  expect(circle('uk')).toBeUndefined()
  expect(official.forCollection({ prefix: 'lucide' })('cn')).toBeUndefined()
})

it('rejects a snapshot whose bytes no longer match its recorded SHA-256', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'icon-search-official-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  await Promise.all([
    cp(join(resourcesDirectory, 'manifest.json'), join(directory, 'manifest.json')),
    cp(join(resourcesDirectory, 'official'), join(directory, 'official'), { recursive: true }),
  ])
  await appendFile(join(directory, 'official/icon-park.json'), ' ')

  await expect(loadOfficialIconSearchData(directory)).rejects.toThrow(
    'Official snapshot checksum mismatch: official/icon-park.json',
  )
})
