import { expect, vi } from 'vitest'
import { compileIconSearchConcepts } from '../../../../src/modules/icons/search/concepts'
import {
  deriveIconSearchFacts,
  type IconSearchCategory,
} from '../../../../src/modules/icons/search/facts'
import { insertDocumentBatch } from '../../../../src/modules/icons/search/indexing/documents'
import { planIconSearchQuery } from '../../../../src/modules/icons/search/planner'
import { findRankedIconSearchRows } from '../../../../src/modules/icons/search/ranked-rows'
import { dbTest, type TestDatabase } from '../../../fixtures/database'

const dictionary = compileIconSearchConcepts({
  words: [
    { zh: ['通知'], en: ['notification'] },
    { zh: ['日志'], en: ['logs', 'audit-log'] },
    { zh: ['鼠标'], en: ['mouse'], demoteCategories: ['emoji'] },
    {
      zh: ['加粗'],
      exactNames: ['bold', 'bold-hidden'],
      exclude: ['hidden'],
      demoteCategories: ['brand'],
    },
    { zh: ['文件'], en: ['file'] },
    { zh: ['文件夹'], en: ['folder'] },
    { zh: ['打开'], en: ['open'] },
    { zh: ['标题'], en: ['heading'] },
  ],
  phrases: [
    { zh: ['登出', '退出登录'], en: ['log-out'] },
    { zh: ['罐头'], en: ['can'], exclude: ['trash-can', 'watering'] },
    { zh: ['打开文件夹'], en: ['folder-open'], parts: ['打开', '文件夹'] },
  ],
  intent: [{ zh: ['通知'], intentEn: ['bell'] }],
})

type FixtureDocument = {
  id: string
  category?: IconSearchCategory
  keywords?: string[]
  title?: string
  tags?: string[]
  classification?: string[]
  palette?: boolean
}

async function insertDocuments(db: TestDatabase, documents: FixtureDocument[]) {
  const facts = documents.map((document, index) => {
    const [prefix, name] = document.id.split(':') as [string, string]
    const {
      category = 'ui',
      keywords = [],
      title,
      tags = [],
      classification = [],
      palette = false,
    } = document
    const source = category === 'custom' ? 'custom' : 'builtin'
    const customIconId =
      source === 'custom' ? `019938cd-c937-7000-8000-${String(index).padStart(12, '0')}` : null
    return deriveIconSearchFacts(
      {
        id: document.id,
        prefix,
        name,
        collection: prefix,
        source,
        category,
        palette,
        customIconId,
      },
      { keywords, titles: title ? [title] : [], tags, categories: classification },
    )
  })
  await insertDocumentBatch(db, facts)
}

function search(
  db: TestDatabase,
  query: string,
  options?: Partial<Parameters<typeof findRankedIconSearchRows>[2]>,
) {
  return findRankedIconSearchRows(db, planIconSearchQuery(query, dictionary), {
    limit: 60,
    ...options,
  })
}

type SearchRows = Awaited<ReturnType<typeof search>>

function scores(rows: SearchRows) {
  return rows.map(({ id, tier, matchScore }) => [id, tier, matchScore])
}

dbTest(
  'uses exact IDs, the legacy English ordering and letter-only prefix matching',
  async ({ db }) => {
    await insertDocuments(db, [
      { id: 'lucide:at-sign' },
      { id: 'lucide:signpost' },
      { id: 'lucide:file' },
      { id: 'lucide:add-file' },
      { id: 'tabler:file' },
      { id: 'mdi:rotate-3d' },
      { id: 'mdi:rotate-3dm' },
      { id: 'mdi:abc123' },
      { id: 'acme:premium', category: 'custom', keywords: ['finance'] },
    ])
    const exact = await search(db, ' ＬＵＣＩＤＥ：ＦＩＬＥ ')
    expect(scores(exact)).toEqual([['lucide:file', 0, 0]])
    expect(await search(db, 'lucide:file', { prefix: 'tabler' })).toEqual([])
    expect(await search(db, 'lucide:file', { after: exact[0]! })).toEqual([])
    expect(scores(await search(db, 'file'))).toEqual([
      ['lucide:file', 0, 0],
      ['tabler:file', 0, 0],
      ['lucide:add-file', 1, 0],
    ])
    const sign = await search(db, 'sign', { limit: 1 })
    expect(scores(sign)).toEqual([
      ['lucide:at-sign', 1, 0],
      ['lucide:signpost', 2, 0],
    ])
    expect(scores(await search(db, 'sign', { after: sign[0]!, limit: 1 }))).toEqual([
      ['lucide:signpost', 2, 0],
    ])
    expect(scores(await search(db, '3d'))).toEqual([['mdi:rotate-3d', 1, 0]])
    expect(scores(await search(db, 'fina', { source: 'custom' }))).toEqual([['acme:premium', 2, 0]])
    for (const query of ['s', '3', 'abc', '!!!']) expect(await search(db, query)).toEqual([])
  },
)

dbTest(
  'ranks whole-query evidence and stops once the first tier fills the page',
  async ({ db }) => {
    await insertDocuments(db, [
      { id: 'tabler:badge', title: '通知' },
      { id: 'lucide:notification' },
      { id: 'lucide:bell' },
      { id: 'mdi:notification' },
      { id: 'mdi:bell' },
      { id: 'acme:badge', category: 'custom', keywords: ['通知'] },
      { id: 'mdi:notification-alert' },
      { id: 'ri:file-line', tags: ['通知'] },
    ])
    const execute = vi.spyOn(db, 'execute')
    const first = await search(db, '通知', { limit: 2 })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(scores(first)).toEqual([
      ['lucide:notification', 0, 3],
      ['tabler:badge', 0, 3],
      ['acme:badge', 0, 3],
    ])
    expect(scores(await search(db, '通知', { after: first[2]! }))).toEqual([
      ['lucide:bell', 0, 2],
      ['mdi:notification', 0, 1],
      ['mdi:bell', 0, 0],
      ['mdi:notification-alert', 1, 1],
      ['ri:file-line', 2, 0],
    ])
    execute.mockRestore()
  },
)

dbTest(
  'applies word order, exclusions and category demotions only to inferred matches',
  async ({ db }) => {
    await insertDocuments(db, [
      { id: 'lucide:log-out' },
      { id: 'acme:badge', category: 'custom', keywords: ['退出登录'] },
      { id: 'acme:log', category: 'custom', keywords: ['out'] },
      { id: 'mdi:log-circle-out' },
      { id: 'ri:door-line', tags: ['退出登录'] },
      { id: 'mdi:trash-can' },
      { id: 'mdi:can-trash' },
      { id: 'mdi:trash-recycling-can' },
      { id: 'mdi:trash-can-open', title: '罐头', classification: ['watering'] },
      { id: 'mdi:can-fill', classification: ['watering'] },
      { id: 'watering-ui:can-open' },
      { id: 'lucide:mouse' },
      { id: 'emojione:mouse', category: 'emoji' },
      { id: 'emojione:computer-mouse', category: 'emoji', title: '电脑鼠标', tags: ['鼠标'] },
      { id: 'noto:mouse', category: 'emoji', title: '鼠标' },
    ])
    expect(scores(await search(db, '登出'))).toEqual([
      ['lucide:log-out', 0, 3],
      ['acme:badge', 1, 1],
      ['ri:door-line', 2, 0],
    ])
    expect(scores(await search(db, '罐头'))).toEqual([
      ['mdi:trash-can-open', 0, 1],
      ['mdi:can-trash', 1, 1],
      ['mdi:trash-recycling-can', 1, 1],
      ['watering-ui:can-open', 1, 1],
    ])
    expect(scores(await search(db, '鼠标'))).toEqual([
      ['lucide:mouse', 0, 3],
      ['noto:mouse', 0, 1],
      ['emojione:computer-mouse', 2, 0],
      ['emojione:mouse', 2, 0],
    ])
  },
)

dbTest(
  'matches complete concept names in whole and mixed queries without rewarding style suffixes',
  async ({ db }) => {
    await insertDocuments(db, [
      { id: 'lucide:bold' },
      { id: 'ph:airplane-bold' },
      { id: 'mdi:button-bold', tags: ['加粗'] },
      { id: 'mdi:button', tags: ['加粗'] },
      { id: 'logos:bold', category: 'brand' },
      { id: 'other:bold-hidden' },
    ])
    const rows = await search(db, '加粗')
    expect(scores(rows)).toEqual([
      ['lucide:bold', 0, 3],
      ['mdi:button', 2, 0],
      ['mdi:button-bold', 2, 0],
      ['logos:bold', 2, 0],
    ])
    expect(rows[1]!.rank).toBe(rows[2]!.rank)
    expect(scores(await search(db, 'lucide 加粗'))).toEqual([['lucide:bold', 1, 1]])
    expect((await search(db, 'bold', { prefix: 'ph' })).map((row) => row.id)).toEqual([
      'ph:airplane-bold',
    ])
  },
)

dbTest(
  'uses the same fields for concept inference and rank while preserving user English and keyword weights',
  async ({ db }) => {
    await insertDocuments(db, [
      { id: 'file-icons:adobe' },
      { id: 'file-icons:npm', tags: ['文件'] },
      { id: 'file-icons:read', classification: ['file'] },
      { id: 'acme:report', category: 'custom', keywords: ['file'] },
      { id: 'acme:summary', tags: ['文件'] },
    ])
    const rows = await search(db, '文件')
    expect(scores(rows)).toEqual([
      ['acme:report', 1, 1],
      ['file-icons:read', 1, 0],
      ['acme:summary', 2, 0],
      ['file-icons:npm', 2, 0],
    ])
    expect(Number(rows[0]?.rank)).toBeGreaterThan(Number(rows[1]?.rank))
    expect(rows.slice(2).map(({ rank }) => rank)).toEqual(['0', '0'])
    expect(scores(await search(db, 'file 文件', { prefix: 'file-icons' }))).toEqual([
      ['file-icons:read', 1, 0],
      ['file-icons:npm', 2, 0],
    ])
  },
)

dbTest(
  'keeps full fragments, matches explicit parts, and seeks across every tier',
  async ({ db }) => {
    await insertDocuments(db, [
      { id: 'acme:full', category: 'custom', keywords: ['acme 日志通知'] },
      { id: 'acme:report', category: 'custom', keywords: ['日志通知'] },
      { id: 'acme:logs-notification' },
      { id: 'acme:report-line', tags: ['日志通知'] },
      { id: 'acmeworks:report', title: '日志通知' },
      { id: 'acme:logs' },
      { id: 'elsewhere:logs-notification' },
      { id: 'lucide:folder-open' },
      { id: 'mdi:folder-layer-open' },
      { id: 'mdi:folder' },
      { id: 'lucide:h4' },
      { id: 'tabler:heading-4' },
    ])
    const query = 'acme 日志通知'
    const expected = await search(db, query)
    expect(scores(expected)).toEqual([
      ['acme:full', 0, 3],
      ['acme:logs-notification', 1, 2],
      ['acme:report', 1, 1],
      ['acme:report-line', 2, 0],
      ['acmeworks:report', 3, 1],
    ])
    let after: SearchRows[number] | undefined
    const paged: SearchRows = []
    while (paged.length < expected.length) {
      const page = await search(db, query, { limit: 1, ...(after ? { after } : {}) })
      expect(page).toHaveLength(Math.min(2, expected.length - paged.length))
      after = page[0]!
      paged.push(after)
    }
    expect(paged).toEqual(expected)
    expect(await search(db, query, { limit: 1, after: paged.at(-1)! })).toEqual([])
    expect(await search(db, `${query} qzxmissing`)).toEqual([])
    expect(await search(db, 'a 日志通知')).toEqual([])
    expect(scores(await search(db, '打开文件夹'))).toEqual([
      ['lucide:folder-open', 0, 3],
      ['mdi:folder-layer-open', 1, 1],
    ])
    for (const query of ['四级标题', '4级标题', '标题4', '标题级别4']) {
      expect(scores(await search(db, query))).toEqual([
        ['tabler:heading-4', 0, 3],
        ['lucide:h4', 0, 3],
      ])
    }
    expect(scores(await search(db, 'lucide 四级标题'))).toEqual([['lucide:h4', 1, 1]])
  },
)
