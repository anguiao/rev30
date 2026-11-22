import {
  builtinIconListResponseSchema,
  customIconListResponseSchema,
  iconSearchResponseSchema,
} from '@rev30/contracts'
import { beforeAll, describe, expect } from 'vitest'
import { loadIconPackage } from '../../../../scripts/icon-search/build/package-source'
import { deriveCollectionSearchFacts } from '../../../../scripts/icon-search/build/package-facts'
import { iconSearchResourcesDirectory } from '../../../../scripts/icon-search/build/maintenance'
import { loadOfficialIconSearchData } from '../../../../scripts/icon-search/official/load'
import { createCustomIconSetService } from '../../../../src/modules/content/icon-sets/custom/service'
import type { IconSearchFacts } from '../../../../src/modules/icons/search/facts'
import { initializeRuntimeIconSearchConcepts } from '../../../../src/modules/icons/search/runtime-concepts'
import { createIconSearchService } from '../../../../src/modules/icons/search/service'
import { dbTest } from '../../../fixtures/database'
import { replaceIconSearchDocuments } from '../../../fixtures/icon-search'
import { createApp } from '../../../helpers/app'
import { createSystemAccessFixture } from '../../../helpers/auth'

const builtinIds = new Set([
  'ant-design:bold',
  'bxl:windows',
  'carbon:data-table',
  'cib:internet-explorer',
  'cil:account-logout',
  'circle-flags:cn',
  'circle-flags:in',
  'emojione:computer-mouse',
  'emojione:mouse',
  'file-icons:adobe',
  'file-icons:edge',
  'file-icons:npm',
  'heroicons:camera',
  'icon-park-outline:block-seven',
  'logos:flask',
  'logos:microsoft-windows',
  'lucide:bell',
  'lucide:bluetooth',
  'lucide:calendar',
  'lucide:flask-round',
  'lucide:folder-open',
  'lucide:heading-4',
  'lucide:log-out',
  'lucide:logs',
  'lucide:mouse',
  'lucide:rotate-3d',
  'lucide:server',
  'material-symbols:notifications',
  'mdi:account-alert',
  'mdi:bell',
  'mdi:cart',
  'mdi:color',
  'mdi:to-do',
  'mdi:trash-can',
  'oi:account-logout',
  'ri:file-add-line',
  'ri:file-line',
  'solar:calendar-linear',
  'system-uicons:user-add',
  'tabler:database',
  'twemoji:computer-mouse',
  'twemoji:face-with-tears-of-joy',
  'twemoji:red-paper-lantern',
  'twemoji:rocket',
])
const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h10v10H0z" /></svg>'

let facts: IconSearchFacts[]

beforeAll(async () => {
  const [iconPackage, official] = await Promise.all([
    loadIconPackage(),
    loadOfficialIconSearchData(iconSearchResourcesDirectory),
    initializeRuntimeIconSearchConcepts(),
  ])
  const prefixes = new Set([...builtinIds].map((id) => id.slice(0, id.indexOf(':'))))
  facts = iconPackage.collections
    .filter(({ prefix }) => prefixes.has(prefix))
    .flatMap((collection) =>
      deriveCollectionSearchFacts(collection, official).filter(({ id }) => builtinIds.has(id)),
    )
  expect(new Set(facts.map(({ id }) => id))).toEqual(builtinIds)
})

describe('maintained Chinese icon search', () => {
  dbTest('serves the same ranked Chinese results in both public entry points', async ({ db }) => {
    await replaceIconSearchDocuments(db, facts)
    const { authHeaders: headers } = await createSystemAccessFixture(db, {
      accessCodes: ['content:icon-set:list'],
    })
    const app = createApp(db)

    for (const [keyword, expected] of [
      ['通知', ['material-symbols:notifications', 'lucide:bell', 'mdi:bell']],
      ['lucide 登出', ['lucide:log-out']],
      ['luc 登出', ['lucide:log-out']],
      ['日志', ['lucide:logs']],
      ['俄罗斯方块', ['icon-park-outline:block-seven']],
      ['登出 qzxmissing', []],
    ] as const) {
      const query = encodeURIComponent(keyword)
      const selector = await app.request(`/api/icons/search?keyword=${query}`, { headers })
      const library = await app.request(`/api/content/icon-sets/builtin/icons?keyword=${query}`, {
        headers,
      })
      expect(selector.status, keyword).toBe(200)
      expect(library.status, keyword).toBe(200)
      const selectorBody = iconSearchResponseSchema.parse(await selector.json())
      const libraryBody = builtinIconListResponseSchema.parse(await library.json())
      expect(
        selectorBody.list.map(({ icon }) => icon),
        keyword,
      ).toEqual(expected)
      expect(
        libraryBody.list.map(({ icon }) => icon),
        keyword,
      ).toEqual(expected)
    }
  })

  dbTest(
    'matches real package names, aliases, categories, and scoped official labels',
    async ({ db }) => {
      await replaceIconSearchDocuments(db, facts)
      const selector = createIconSearchService(db)
      const search = async (keyword: string) =>
        (await selector.searchIcons({ keyword, limit: 20 })).list.map(({ icon }) => icon)

      for (const [keyword, id] of [
        ['粗体', 'ant-design:bold'],
        ['颜色', 'mdi:color'],
        ['待办', 'mdi:to-do'],
        ['账户 登出', 'cil:account-logout'],
        ['账户 登出', 'oi:account-logout'],
        ['日历', 'lucide:calendar'],
        ['日历', 'solar:calendar-linear'],
        ['数据库', 'tabler:database'],
        ['服务器', 'lucide:server'],
        ['蓝牙', 'lucide:bluetooth'],
        ['购物车', 'mdi:cart'],
        ['相机', 'heroicons:camera'],
        ['数据表', 'carbon:data-table'],
        ['红灯笼', 'twemoji:red-paper-lantern'],
        ['笑哭', 'twemoji:face-with-tears-of-joy'],
        ['火箭', 'twemoji:rocket'],
        ['中国', 'circle-flags:cn'],
        ['印度', 'circle-flags:in'],
        ['电脑鼠标', 'twemoji:computer-mouse'],
        ['打开的文件夹', 'lucide:folder-open'],
        ['标题级别4', 'lucide:heading-4'],
        ['3d', 'lucide:rotate-3d'],
        ['internet-explorer', 'cib:internet-explorer'],
      ] as const) {
        expect(await search(keyword), keyword).toContain(id)
      }

      expect(await search('用户')).toEqual(['system-uicons:user-add', 'mdi:account-alert'])
      expect(await search('微软')).toEqual(['logos:microsoft-windows'])
      expect(await search('ie')).toEqual([])
      expect(await search('文件')).not.toContain('file-icons:npm')
      expect(await search('文件')).not.toContain('file-icons:adobe')
      expect(await search('罐头')).not.toContain('mdi:trash-can')
      expect(await search('烧瓶')).toEqual(['lucide:flask-round', 'logos:flask'])
      const mouse = await search('鼠标')
      expect(mouse[0]).toBe('lucide:mouse')
      expect(mouse).toEqual(expect.arrayContaining(['emojione:mouse', 'twemoji:computer-mouse']))
      const create = await search('新建')
      expect(create).toEqual(expect.arrayContaining(['ri:file-add-line', 'ri:file-line']))
      expect(create.indexOf('ri:file-add-line')).toBeLessThan(create.indexOf('ri:file-line'))
    },
  )

  dbTest('searches saved custom Chinese keywords alongside package facts', async ({ db }) => {
    await replaceIconSearchDocuments(db, facts)
    const custom = createCustomIconSetService(db)
    await custom.create({ prefix: 'acme', name: 'Acme', description: null })
    await custom.uploadIcons('acme', {
      duplicateStrategy: 'skip',
      files: [
        { filename: 'Badge.svg', content: svg, keywords: ['通知', 'finance'] },
        { filename: 'Seal.svg', content: svg, keywords: ['退出登录'] },
        { filename: 'Logbook.svg', content: svg, keywords: ['日志通知'] },
        { filename: 'Navigation.svg', content: svg, keywords: ['菜单', '管理'] },
        { filename: 'Navigation-phrase.svg', content: svg, keywords: ['菜单管理'] },
        { filename: 'Partial.svg', content: svg, keywords: ['菜单', '后台管理'] },
        { filename: 'Series.svg', content: svg, keywords: ['Ｋ', '线图'] },
        { filename: 'K.svg', content: svg, keywords: ['Ｋ 参考', '线图'] },
      ],
    })

    const { authHeaders: headers } = await createSystemAccessFixture(db, {
      accessCodes: ['content:icon-set:list'],
    })
    const app = createApp(db)
    for (const [keyword, expected] of [
      ['通知', ['acme:badge']],
      ['fina', ['acme:badge']],
      ['登出', ['acme:seal']],
      ['acme 日志通知', ['acme:logbook']],
      ['acme 日志通知 qzxmissing', []],
      ['菜单　管理', ['acme:navigation-phrase', 'acme:navigation']],
      ['菜单管理', ['acme:navigation-phrase']],
      ['Ｋ 线图', ['acme:series']],
    ] as const) {
      const query = encodeURIComponent(keyword)
      const selector = await app.request(`/api/icons/search?keyword=${query}`, { headers })
      const library = await app.request(
        `/api/content/icon-sets/custom/icons?prefix=acme&keyword=${query}`,
        { headers },
      )
      expect(selector.status, keyword).toBe(200)
      expect(library.status, keyword).toBe(200)
      const selectorIds = iconSearchResponseSchema
        .parse(await selector.json())
        .list.map(({ icon }) => icon)
      const libraryIds = customIconListResponseSchema
        .parse(await library.json())
        .list.map(({ icon }) => icon)
      expect(libraryIds, keyword).toEqual(expected)
      expect(
        selectorIds.filter((id) => id.startsWith('acme:')),
        keyword,
      ).toEqual(expected)
      if (keyword === '通知') {
        expect(selectorIds).toContain('lucide:bell')
        expect(selectorIds.indexOf('acme:badge')).toBeLessThan(selectorIds.indexOf('lucide:bell'))
      }
      if (expected.length === 0) expect(selectorIds).toEqual([])
    }

    await custom.updateIcon('acme', 'k', { keywords: ['Ｋ', '线图'] })
    const chart = await createIconSearchService(db).searchIcons({ keyword: 'K 线图', limit: 20 })
    expect(chart.list.map(({ icon }) => icon)).toContain('acme:k')
  })
})
