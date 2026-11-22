import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migratePGlite } from '../../../src/db/migrate'
import { relations } from '../../../src/db/relations'
import { customIconSetIcons, customIconSets, iconSearchDocuments } from '../../../src/db/schema'
import { listBuiltinIcons } from '../../../src/modules/content/icon-sets/builtin/service'
import { ICON_PACKAGE_VERSION } from '../../../src/modules/icons/builtin'
import {
  defaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../../src/modules/icons/search/artifacts/reader'
import { prepareIconSearchIndex } from '../../../src/modules/icons/search/indexing/lifecycle'
import { getCommittedIconSearchState } from '../../../src/modules/icons/search/indexing/state'
import type { RankedIconSearchRow } from '../../../src/modules/icons/search/ranked-rows'
import { searchIconDocuments } from '../../../src/modules/icons/search/repository'
import { initializeRuntimeIconSearchConcepts } from '../../../src/modules/icons/search/runtime-concepts'
import { createIconSearchService } from '../../../src/modules/icons/search/service'
import { adminCases, variantCases } from './cases'
import englishBaseline from './english-baseline.json' with { type: 'json' }

type SearchOptions = Partial<Omit<Parameters<typeof searchIconDocuments>[1], 'keyword'>>
type PagedSearchOptions = Omit<SearchOptions, 'cursor'>
type SearchRows = readonly RankedIconSearchRow[]

const firstPageSize = 12
const dbDirectory = await mkdtemp(join(tmpdir(), 'rev30-icon-search-regression-'))
const client = new PGlite(dbDirectory)
const database = drizzle({ client, relations })

const customIcons = [
  { name: 'badge', keywords: ['finance', 'audit'] },
  { name: 'diamond', keywords: ['通知'] },
  { name: 'diamond-alt', keywords: ['退出登录'] },
  { name: 'log', keywords: ['out'] },
  { name: 'lock', keywords: ['lock', 'unlock'] },
  { name: 'lock-unlocked', keywords: [] },
  { name: 'marks', keywords: ['log', 'out'] },
  { name: 'status', keywords: ['日志通知'] },
  { name: 'inverted', keywords: ['不可见'] },
]

before(async () => {
  const directory = defaultIconSearchArtifactDirectory
  const manifest = await readIconSearchManifest(directory)
  await initializeRuntimeIconSearchConcepts()
  await migratePGlite(client)

  const [set] = await database
    .insert(customIconSets)
    .values({ prefix: 'acme', name: 'Acme' })
    .returning()
  assert(set)
  await database.insert(customIconSetIcons).values(
    customIcons.map((icon) => ({
      ...icon,
      setId: set.id,
      body: '<path d="M0 0h16v16H0z"/>',
      width: 16,
      height: 16,
    })),
  )

  await prepareIconSearchIndex(database, {
    installedIconPackageVersion: ICON_PACKAGE_VERSION,
    loadArtifacts: async () => ({
      manifest,
      documents: iterateIconSearchArtifacts(directory, manifest),
    }),
  })
  const state = await getCommittedIconSearchState(database)
  assert.equal(state?.documentCount, manifest.counts.documents + customIcons.length)
  console.log(
    `Indexed ${manifest.counts.documents} builtin icons from @iconify/json ${manifest.iconPackageVersion}`,
  )
})

after(async () => {
  await client.close()
  await rm(dbDirectory, { recursive: true })
})

function search(keyword: string, options: SearchOptions = {}) {
  return searchIconDocuments(database, { keyword, limit: firstPageSize, ...options })
}

async function* searchPages(keyword: string, { limit = 60, ...filters }: PagedSearchOptions = {}) {
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    const page = await search(keyword, { ...filters, limit, ...(cursor ? { cursor } : {}) })
    yield page.rows
    cursor = page.nextCursor
    if (cursor !== null) {
      assert(!cursors.has(cursor), `Repeated cursor for ${keyword}`)
      cursors.add(cursor)
    }
  } while (cursor !== null)
}

async function completeSearch(keyword: string, options: PagedSearchOptions = {}) {
  const rows: RankedIconSearchRow[] = []
  for await (const page of searchPages(keyword, options)) rows.push(...page)
  return rows
}

async function searchThrough(keyword: string, targetId: string) {
  const rows: RankedIconSearchRow[] = []
  for await (const page of searchPages(keyword)) {
    rows.push(...page)
    if (page.some(({ id }) => id === targetId)) break
  }
  return rows
}

function rowIds(rows: SearchRows) {
  return rows.map(({ id }) => id)
}

function describeRows(rows: SearchRows) {
  return rows
    .map(({ id, tier, matchScore }) => `${id} (tier ${tier}, score ${matchScore})`)
    .join(', ')
}

function requireHit(rows: SearchRows, values: readonly string[], field: 'id' | 'name' = 'id') {
  const match = rows.find((row) => values.includes(row[field]))
  assert(match, `Expected ${values.join(' or ')} in ${describeRows(rows) || '(empty results)'}`)
  return match
}

function assertBefore(rows: SearchRows, earlier: RankedIconSearchRow, later: RankedIconSearchRow) {
  assert(
    rows.indexOf(earlier) < rows.indexOf(later),
    `Expected ${earlier.id} before ${later.id} in ${describeRows(rows)}`,
  )
}

async function readEvidence(id: string) {
  const [document] = await database
    .select({
      category: iconSearchDocuments.category,
      exactKeys: iconSearchDocuments.exactKeys,
      tokens: iconSearchDocuments.tokens,
      primaryTokens: iconSearchDocuments.primaryTokens,
      relatedTokens: iconSearchDocuments.relatedTokens,
    })
    .from(iconSearchDocuments)
    .where(eq(iconSearchDocuments.id, id))
  assert(document, `Missing indexed document ${id}`)
  return document
}

async function assertPagination(
  keyword: string,
  prefix: string,
  expected: readonly string[],
  pageSize: number,
) {
  assert(expected.length > pageSize, `Expected multiple pages for ${keyword}`)
  assert.equal(new Set(expected).size, expected.length, `Expected unique results for ${keyword}`)
  let cursor: string | null = null
  for (let offset = 0; offset < expected.length; offset += pageSize) {
    const page = await search(keyword, { prefix, limit: pageSize, ...(cursor ? { cursor } : {}) })
    assert.deepEqual(rowIds(page.rows), expected.slice(offset, offset + pageSize))
    assert.equal(Boolean(page.nextCursor), offset + pageSize < expected.length)
    cursor = page.nextCursor
  }
}

void describe('Common admin menus and actions', () => {
  for (const [keyword, ...names] of adminCases) {
    void it(keyword, async () => {
      requireHit((await search(keyword)).rows, names, 'name')
    })
  }

  void it('登出 finds a sign-out icon', async () => {
    requireHit((await search('登出')).rows, ['lucide:log-out'])
  })

  void it('日志 finds logs without sign-out icons on the first page', async () => {
    const { rows } = await search('日志')
    requireHit(rows, ['lucide:logs'])
    assert(!rows.some(({ name }) => /(?:^|-)log-out(?:-|$)/.test(name)), describeRows(rows))
  })

  for (const [keyword, id] of [
    ['服务器', 'lucide:server'],
    ['蓝牙', 'lucide:bluetooth'],
  ] as const) {
    void it(`${keyword} with the Lucide filter`, async () => {
      const { rows } = await search(keyword, { prefix: 'lucide' })
      assert.equal(requireHit(rows, [id]).tier, 0)
    })
  }
})

void describe('Direct and intended meanings on the first page', () => {
  void it('通知 includes a direct notification icon, a bell, and a custom keyword match', async () => {
    const { rows } = await search('通知', { limit: 60 })
    const firstPage = rows.slice(0, firstPageSize)
    const direct = requireHit(firstPage, [
      'tabler:notification',
      'ph:notification',
      'material-symbols:notifications',
    ])
    const bell = requireHit(firstPage, ['lucide:bell'])
    const custom = requireHit(firstPage, ['acme:diamond'])
    const nonPreferred = rows.find(
      ({ name, tier, matchScore }) =>
        (name === 'notification' || name === 'notifications') && tier === 0 && matchScore === 1,
    )
    assert(nonPreferred, `Expected a non-preferred notification icon in ${describeRows(rows)}`)
    assert.deepEqual([direct.tier, direct.matchScore, bell.tier, bell.matchScore], [0, 3, 0, 2])
    assert.deepEqual([custom.tier, custom.matchScore], [0, 3])
    assertBefore(rows, direct, bell)
    assertBefore(rows, custom, bell)
    assertBefore(rows, bell, nonPreferred)
  })

  for (const keyword of ['删除', '移除']) {
    void it(`${keyword} includes a direct delete icon and a Lucide trash icon`, async () => {
      const { rows } = await search(keyword)
      const direct = requireHit(rows, ['material-symbols:delete', 'material-symbols-light:delete'])
      const trash = requireHit(rows, ['lucide:trash', 'lucide:trash-2'])
      assert.equal(direct.tier, 0)
      assert.deepEqual([trash.tier, trash.matchScore], [0, 2])
    })
  }

  for (const keyword of ['首页', '主页']) {
    void it(`${keyword} includes home and Lucide house`, async () => {
      const { rows } = await search(keyword)
      const direct = requireHit(rows, ['home'], 'name')
      const house = requireHit(rows, ['lucide:house'])
      assert.equal(direct.tier, 0)
      assert.deepEqual([house.tier, house.matchScore], [0, 2])
    })
  }
})

void describe('Spacing, numeric forms, and synonyms', () => {
  for (const { queries, names } of variantCases) {
    for (const keyword of queries) {
      void it(keyword, async () => {
        requireHit((await search(keyword)).rows, names, 'name')
      })
    }
  }

  for (const keyword of ['文件恢复', '恢复文件']) {
    void it(`${keyword} directly matches the MDI file restore icon`, async () => {
      const { rows } = await search(keyword, { prefix: 'mdi' })
      const direct = requireHit(rows, ['mdi:file-restore'])
      assert.deepEqual([direct.tier, direct.matchScore], [0, 1])
    })
  }
})

void describe('Official Chinese metadata', () => {
  void it('俄罗斯方块 uses the official IconPark title', async () => {
    const { rows } = await search('俄罗斯方块')
    const hit = requireHit(rows, [
      'icon-park:block-seven',
      'icon-park-outline:block-seven',
      'icon-park-solid:block-seven',
      'icon-park-twotone:block-seven',
    ])
    assert.equal(hit.tier, 0)
    assert((await readEvidence(hit.id)).exactKeys.includes('俄罗斯方块'))
  })

  void it('笑哭 uses a CLDR tag on the laughing emoji', async () => {
    const { rows } = await search('笑哭')
    const hit = requireHit(rows, ['twemoji:face-with-tears-of-joy'])
    assert.equal(hit.tier, 2)
    const evidence = await readEvidence(hit.id)
    assert.equal(evidence.category, 'emoji')
    assert(evidence.relatedTokens.includes('笑哭'))
    assert(!evidence.primaryTokens.includes('笑哭'))
  })

  void it('火箭 matches the rocket emoji via its CLDR title', async () => {
    const hit = requireHit(await searchThrough('火箭', 'twemoji:rocket'), ['twemoji:rocket'])
    assert.equal(hit.tier, 0)
    const evidence = await readEvidence(hit.id)
    assert.equal(evidence.category, 'emoji')
    assert(evidence.exactKeys.includes('火箭'))
  })

  void it('电脑鼠标 directly matches the mouse emoji via its CLDR title', async () => {
    const { rows } = await search('电脑鼠标')
    const hit = requireHit(rows, ['twemoji:computer-mouse'])
    assert.equal(hit.tier, 0)
    const evidence = await readEvidence(hit.id)
    assert.equal(evidence.category, 'emoji')
    assert(evidence.exactKeys.includes('电脑鼠标'))
  })

  for (const [keyword, country] of [
    ['中国', 'cn'],
    ['日本', 'jp'],
  ] as const) {
    void it(`${keyword} finds its flag via the ISO mapping`, async () => {
      const { rows } = await search(keyword)
      const hit = requireHit(rows, [
        `flag:${country}-1x1`,
        `flag:${country}-4x3`,
        `flagpack:${country}`,
        `circle-flags:${country}`,
        `cif:${country}`,
      ])
      assert.equal(hit.tier, 0)
      const evidence = await readEvidence(hit.id)
      assert.equal(evidence.category, 'flag')
      assert(evidence.exactKeys.includes(keyword))
    })
  }
})

void describe('Ambiguity and required conditions', () => {
  void it('keeps standalone English names that directly represent a Chinese formatting or shape query', async () => {
    for (const [keyword, prefix, name] of [
      ['加粗', 'lucide', 'bold'],
      ['填充', 'mdi', 'fill'],
      ['线段', 'tabler', 'line'],
    ] as const) {
      const { rows } = await search(keyword, { prefix })
      assert.equal(requireHit(rows, [name], 'name').tier, 0)
    }
  })

  for (const [keyword, prefix, expected, unrelated] of [
    ['灯具', 'ph', 'lamp', 'airplane-light'],
    ['边界', 'mdi', 'border-all', 'account-alert-outline'],
    ['圆角', 'material-symbols', 'rounded-corner', 'ulna-radius-rounded'],
    ['填充', 'ph', 'paint-bucket-fill', 'airplane-fill'],
    ['描边', 'material-symbols', 'stroke-full', '10k-outline'],
    ['轮廓', 'mdi', 'shape-outline', 'academic-cap-outline'],
    ['粗体', 'ph', 'text-b', 'airplane-bold'],
    ['线段', 'ri', 'separator', '24-hours-line'],
    ['直线', 'ri', 'separator', '4k-line'],
  ] as const) {
    void it(`${keyword} finds the intended shape or action in ${prefix}`, async () => {
      const rows = await completeSearch(keyword, { prefix })
      requireHit(rows.slice(0, firstPageSize), [expected], 'name')
      assert(!rows.some(({ name }) => name === unrelated), `Unexpected ${prefix}:${unrelated}`)
    })
  }

  void it('罐头 finds canned food without matching a trash can', async () => {
    const rows = await completeSearch('罐头')
    requireHit(
      rows.slice(0, firstPageSize),
      ['canned-food', 'canned-fruit', 'opened-food-can'],
      'name',
    )
    assert(!rowIds(rows).includes('mdi:trash-can'), describeRows(rows))
    assert((await readEvidence('mdi:trash-can')).exactKeys.includes('trash-can'))
  })

  void it('文件 does not treat file-icons as Chinese semantic evidence', async () => {
    const { rows } = await search('文件')
    requireHit(rows, ['file', 'document'], 'name')
    const scoped = await completeSearch('文件', { prefix: 'file-icons' })
    for (const id of ['file-icons:adobe', 'file-icons:npm']) {
      const evidence = await readEvidence(id)
      assert(evidence.tokens.includes('file'))
      assert(!evidence.primaryTokens.includes('file'))
      assert(!rowIds(scoped).includes(id), describeRows(scoped))
    }
  })

  void it('烧瓶 keeps the Flask logo below scientific flasks', async () => {
    const { rows } = await search('烧瓶')
    const flask = requireHit(rows, [
      'tabler:flask',
      'ph:flask',
      'mdi:flask',
      'lucide:flask-conical',
      'bi:flask',
    ])
    assert(flask.tier <= 1, describeRows(rows))
    assert(!rows.some(({ id, tier }) => id === 'logos:flask' && tier <= 1), describeRows(rows))
    const demoted = await search('烧瓶', { prefix: 'logos' })
    assert.equal(requireHit(demoted.rows, ['logos:flask']).tier, 2)
  })

  void it('鼠标 prioritizes a device over an emoji inferred from English', async () => {
    const rows = await searchThrough('鼠标', 'emojione:mouse')
    const device = requireHit(rows.slice(0, firstPageSize), ['lucide:mouse'])
    const inferred = requireHit(rows, ['emojione:mouse'])
    assert.equal(device.tier, 0)
    assert.equal(inferred.tier, 2)
    assertBefore(rows, device, inferred)
  })

  void it('鼠标 with the EmojiOne filter can match either form', async () => {
    const { rows } = await search('鼠标', { prefix: 'emojione' })
    assert.equal(requireHit(rows, ['emojione:computer-mouse']).tier, 2)
    assert.equal(requireHit(rows, ['emojione:mouse']).tier, 2)
  })

  void it('鼠标 with the Twemoji filter uses the CLDR tag', async () => {
    const { rows } = await search('鼠标', { prefix: 'twemoji' })
    const hit = requireHit(rows, ['twemoji:computer-mouse'])
    const evidence = await readEvidence(hit.id)
    assert.equal(hit.tier, 2)
    assert(evidence.relatedTokens.includes('鼠标'))
    assert(!evidence.primaryTokens.includes('鼠标'))
  })

  void it('新建 keeps a plain RemixIcon file below add icons and paginates both tiers', async () => {
    const rows = await completeSearch('新建', { prefix: 'ri' })
    const direct = requireHit(rows, ['ri:add-line', 'ri:add-fill'])
    const tagged = requireHit(rows, ['ri:file-line'])
    assert.equal(direct.tier, 1)
    assert.equal(tagged.tier, 2)
    assertBefore(rows, direct, tagged)
    const evidence = await readEvidence(tagged.id)
    assert(evidence.relatedTokens.includes('新建'))
    assert(!evidence.primaryTokens.includes('新建'))
    await assertPagination('新建', 'ri', rowIds(rows), 7)
  })

  void it('可见 does not match the isolated 不可见 keyword or an official hidden preview', async () => {
    requireHit((await search('可见')).rows, ['lucide:eye', 'material-symbols:visibility'])
    const custom = await completeSearch('可见', { source: 'custom' })
    assert(!rowIds(custom).includes('acme:inverted'), describeRows(custom))
    const iconPark = await completeSearch('可见', { prefix: 'icon-park-outline' })
    assert(!rowIds(iconPark).includes('icon-park-outline:preview-close'), describeRows(iconPark))
    assert((await readEvidence('acme:inverted')).exactKeys.includes('不可见'))
    assert((await readEvidence('icon-park-outline:preview-close')).relatedTokens.includes('不可见'))
  })

  void it('登出 qzxmissing requires the unknown condition too', async () => {
    assert.deepEqual((await search('登出 qzxmissing')).rows, [])
  })
})

void describe('Mixed search, custom keywords, and English compatibility', () => {
  void it('custom keywords add an unlock match while the original lock name still matches', async () => {
    const locked = await search('锁', { source: 'custom' })
    assert.deepEqual(rowIds(locked.rows), ['acme:lock'])
    assert.equal(locked.rows[0]?.tier, 0)

    const unlocked = await search('解锁', { source: 'custom' })
    assert.equal(requireHit(unlocked.rows, ['acme:lock']).tier, 1)
    requireHit(unlocked.rows, ['acme:lock-unlocked'])
  })

  void it('lucide 登出 returns identical rankings through both entry points', async () => {
    const keyword = 'lucide 登出'
    const picker = await createIconSearchService(database).searchIcons({
      keyword,
      limit: firstPageSize,
    })
    const library = await listBuiltinIcons({ keyword, pageSize: firstPageSize }, database)
    assert(picker.list.some(({ icon }) => icon === 'lucide:log-out'))
    assert.deepEqual(
      picker.list.map(({ icon }) => icon),
      library.list.map(({ icon }) => icon),
    )
  })

  void it('tabler 文件夹 combines a collection and a Chinese concept', async () => {
    const { rows } = await search('tabler 文件夹')
    assert.equal(requireHit(rows, ['tabler:folder']).tier, 1)
  })

  void it('luc 登出 supports the English prefix with the Chinese condition', async () => {
    const { rows } = await search('luc 登出')
    assert.equal(requireHit(rows, ['lucide:log-out']).tier, 3)
  })

  for (const keyword of ['lucide:log-out', 'lucide:trash-2']) {
    void it(keyword, async () => {
      const { rows } = await search(keyword)
      assert.deepEqual(rowIds(rows), [keyword])
      assert.equal(requireHit(rows, [keyword]).tier, 0)
    })
  }

  void it('登出 finds the 退出登录 keyword without joining name and keyword terms', async () => {
    const { rows } = await search('登出', { source: 'custom' })
    assert.deepEqual(rowIds(rows), ['acme:diamond-alt'])
    assert.equal(requireHit(rows, ['acme:diamond-alt']).tier, 1)
  })

  void it('fina matches a custom English keyword prefix', async () => {
    const { rows } = await search('fina', { source: 'custom' })
    assert.deepEqual(rowIds(rows), ['acme:badge'])
    assert.equal(requireHit(rows, ['acme:badge']).tier, 2)
  })

  void it('badge finance audit satisfies independent terms without creating an exact phrase', async () => {
    const { rows } = await search('badge finance audit', { source: 'custom' })
    assert.deepEqual(rowIds(rows), ['acme:badge'])
    assert.equal(requireHit(rows, ['acme:badge']).tier, 1)
  })

  void it('acme 日志通知 matches the original custom keyword and requires additional conditions', async () => {
    const { rows } = await search('acme 日志通知')
    assert.deepEqual(rowIds(rows), ['acme:status'])
    assert.equal(requireHit(rows, ['acme:status']).tier, 1)
    assert.deepEqual((await search('acme 日志通知 qzxmissing')).rows, [])
  })

  void it('file preserves the previous first 60 English results', async () => {
    const { rows } = await search('file', { limit: 60 })
    assert.deepEqual(rowIds(rows), englishBaseline.file)
  })

  void it('sign preserves paged Lucide results including signpost in position 15', async () => {
    await assertPagination('sign', 'lucide', englishBaseline.sign, 5)
    const { rows } = await search('sign', { prefix: 'lucide', limit: 16 })
    assert.equal(rows[14]?.id, 'lucide:signpost')
    assert.equal(rows[14]?.tier, 2)
  })

  void it('3d preserves literal numeric terms and no alphabetic prefix expansion', async () => {
    assert.deepEqual(rowIds(await completeSearch('3d', { prefix: 'mdi' })), englishBaseline['3d'])
  })

  void it('ie preserves the absence of an internet-explorer prefix hit', async () => {
    assert.deepEqual(rowIds(await completeSearch('ie', { prefix: 'cib' })), englishBaseline.ie)
  })
})
