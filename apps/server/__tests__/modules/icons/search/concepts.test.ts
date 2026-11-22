import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  compileIconSearchConcepts,
  loadIconSearchConcepts,
} from '../../../../src/modules/icons/search/concepts'

const sources = {
  words: [
    { zh: ['打 开'], en: ['open'] },
    { zh: ['文件夹'], en: ['folder'] },
    { zh: ['Ｋ 线图', '股票图'], en: ['chart-candlestick'] },
    { zh: ['通知', '通知消息'], en: ['notification'], demoteCategories: ['emoji'] },
  ],
  phrases: [{ zh: ['打开文件夹'], en: ['folder-open'], parts: ['打开', '文 件夹'] }],
  intent: [
    {
      zh: ['通 知', '提醒'],
      en: ['notification', 'notifications'],
      intentEn: ['bell', 'bell'],
      exclude: ['door-bell'],
      demoteCategories: ['emoji', 'brand'],
    },
  ],
}

describe('icon search concept dictionary', () => {
  it('normalizes keys and parts and merges matching file entries without linking unrelated groups', () => {
    const { byKey } = compileIconSearchConcepts(sources)

    expect(byKey.get('k线图')?.zh).toEqual(['k线图', '股票图'])
    expect(byKey.get('打开文件夹')?.parts).toEqual(['打开', '文件夹'])
    expect(byKey.get('通知')).toEqual({
      zh: ['通知', '通知消息', '提醒'],
      en: ['notification', 'notifications'],
      intentEn: ['bell'],
      exclude: ['door-bell'],
      demoteCategories: ['emoji', 'brand'],
      parts: [],
    })
    expect(byKey.get('通知消息')?.zh).toEqual(['通知', '通知消息'])
    expect(byKey.get('提醒')?.zh).toEqual(['通知', '提醒'])
    expect(byKey.get('通知消息')?.intentEn).toEqual([])
  })

  it.each([
    [{ zh: [], en: ['notification'] }, 'zh'],
    [{ zh: ['bell'], en: ['bell'] }, 'zh'],
    [{ zh: ['通知'] }, 'en'],
    [{ zh: ['通知'], en: ['door bell'] }, 'en'],
    [{ zh: ['通知'], en: ['bell'], demoteCategories: ['animal'] }, 'demoteCategories'],
  ])('reports invalid source records against their file and field', (record, field) => {
    expect(() => compileIconSearchConcepts({ ...sources, intent: [record] })).toThrow(
      new RegExp(`intent\\.json[\\s\\S]*${field}`),
    )
  })

  it('rejects repeated keys inside the same file after normalization', () => {
    expect(() =>
      compileIconSearchConcepts({
        ...sources,
        words: [{ zh: ['Ｋ 线图', 'k线图'], en: ['chart-candlestick'] }],
      }),
    ).toThrow(/words\.json.*k线图/)
  })

  it('requires composition to reference words and rejects composition on a word', () => {
    expect(() =>
      compileIconSearchConcepts({
        ...sources,
        phrases: [{ zh: ['打开文件夹'], en: ['folder-open'], parts: ['提醒'] }],
      }),
    ).toThrow(/phrases\.json.*提醒/)
    expect(() =>
      compileIconSearchConcepts({
        ...sources,
        words: [{ zh: ['打开'], en: ['open'], parts: ['打开'] }],
      }),
    ).toThrow(/words\.json.*parts/)
  })

  it('loads the three files in stable order and versions data and query rules together', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'icon-search-concepts-'))
    onTestFinished(() => rm(directory, { recursive: true, force: true }))
    await Promise.all(
      Object.entries(sources).map(([file, records]) =>
        writeFile(join(directory, `${file}.json`), JSON.stringify(records)),
      ),
    )

    const original = await loadIconSearchConcepts(directory)
    expect(original).toEqual(compileIconSearchConcepts(sources))
    expect(original.queryRulesVersion).toMatch(/^[0-9a-f]{64}$/)
    expect((await loadIconSearchConcepts(directory, 100)).queryRulesVersion).not.toBe(
      original.queryRulesVersion,
    )

    await writeFile(join(directory, 'intent.json'), '[]')
    expect((await loadIconSearchConcepts(directory)).queryRulesVersion).not.toBe(
      original.queryRulesVersion,
    )
    await writeFile(join(directory, 'intent.json'), ']')
    await expect(loadIconSearchConcepts(directory)).rejects.toThrow(/intent\.json/)
  })
})
