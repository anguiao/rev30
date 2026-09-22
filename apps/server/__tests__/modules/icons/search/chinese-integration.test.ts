import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, onTestFinished } from 'vitest'

import { listBuiltinIcons } from '../../../../src/modules/content/icon-sets/builtin/service'
import { buildIconSearchArtifacts } from '../../../../src/modules/icons/search/artifacts/builder'
import { readIconSearchArtifacts } from '../../../../src/modules/icons/search/artifacts/reader'
import { createIconSearchService } from '../../../../src/modules/icons/search/service'
import { loadMaintainedSearchData } from '../../../../src/modules/icons/search/maintenance'
import { replaceIconSearchDocuments } from '../../../fixtures/icon-search'
import { searchIconDocuments } from '../../../../src/modules/icons/search/query-repository'
import { dbTest } from '../../../fixtures/database'

const fixtureIconOwners = new Set([
  'ant-design:bold',
  'arcticons:minecraft-alt-2',
  'arcticons:google-play',
  'bxl:windows',
  'carbon:data-table',
  'circle-flags:in',
  'cil:account-logout',
  'fa6-solid:bug',
  'fluent:color-16-filled',
  'fa6-brands:apple',
  'file-icons:edge',
  'heroicons:camera',
  'lucide:bell',
  'lucide:calendar',
  'logos:microsoft-windows',
  'logos:netflix-icon',
  'logos:google-workspace',
  'material-symbols:cell-merge',
  'material-symbols:cell-tower',
  'material-symbols:brand-awareness-outline-rounded',
  'material-symbols-light:brand-family',
  'material-symbols:folder',
  'mdi:api',
  'mdi:account',
  'mdi:account-alert',
  'mdi:cart',
  'mdi:color',
  'mdi:cpu-32-bit',
  'mdi:to-do',
  'ion:construct',
  'oi:account-logout',
  'ph:user',
  'solar:calendar-linear',
  'system-uicons:user-add',
  'simple-icons:adobe',
  'simple-icons:alipay',
  'simple-icons:apple',
  'simple-icons:baidu',
  'simple-icons:google',
  'simple-icons:huawei',
  'simple-icons:microsoft',
  'simple-icons:taobao',
  'simple-icons:wechat',
  'simple-icons:xiaomi',
  'streamline-logos:ubisoft-logo',
  'tabler:database',
  'twemoji:red-paper-lantern',
])

let maintained: Awaited<ReturnType<typeof loadMaintainedSearchData>>

beforeAll(async () => {
  const allMaintained = await loadMaintainedSearchData(join(process.cwd(), 'resources/icon-search'))
  maintained = {
    ...allMaintained,
    translations: allMaintained.translations.filter((record) =>
      record.kind === 'icon'
        ? fixtureIconOwners.has(record.owner)
        : record.owner.prefix === 'mdi' && record.owner.category === 'Account / User',
    ),
  }
})

describe('maintained Chinese icon search', () => {
  dbTest(
    'ranks real Chinese name terms before category terms within the same tier',
    async ({ db }) => {
      const outputDirectory = await mkdtemp(join(tmpdir(), 'icon-search-field-ranking-'))
      onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))
      const owners = new Set(['mdi:account-alert', 'system-uicons:user-add'])
      const { manifest } = await buildIconSearchArtifacts({
        collections: [
          {
            prefix: 'mdi',
            collection: 'Material Design Icons',
            palette: false,
            icons: ['account-alert'],
            aliases: {},
            categories: { 'Account / User': ['account-alert'] },
          },
          {
            prefix: 'system-uicons',
            collection: 'System UIcons',
            palette: false,
            icons: ['user-add'],
            aliases: {},
          },
        ],
        iconPackageVersion: 'test',
        maintained: {
          ...maintained,
          translations: maintained.translations.filter(
            (record) => record.kind === 'category' || owners.has(record.owner),
          ),
        },
        outputDirectory,
      })
      const { documents } = await readIconSearchArtifacts(outputDirectory)
      await replaceIconSearchDocuments(db, documents, manifest)
      const result = await searchIconDocuments(db, { query: '用户', limit: 10 })
      expect(result.rows.map((row) => [row.id, row.level])).toEqual([
        ['system-uicons:user-add', 1],
        ['mdi:account-alert', 1],
      ])
    },
  )

  dbTest(
    'indexes reviewed brand names and components without losing variants or adding parent brands',
    async ({ db }) => {
      const outputDirectory = await mkdtemp(join(tmpdir(), 'icon-search-brands-'))
      onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))
      const cases = [
        { prefix: 'simple-icons', name: 'apple', query: '苹果' },
        { prefix: 'simple-icons', name: 'microsoft', query: '微软' },
        { prefix: 'simple-icons', name: 'google', query: '谷歌' },
        { prefix: 'simple-icons', name: 'wechat', query: '微信' },
        { prefix: 'simple-icons', name: 'alipay', query: '支付宝' },
        { prefix: 'simple-icons', name: 'huawei', query: '华为' },
        { prefix: 'simple-icons', name: 'xiaomi', query: '小米' },
        { prefix: 'simple-icons', name: 'baidu', query: '百度' },
        { prefix: 'simple-icons', name: 'taobao', query: '淘宝' },
        { prefix: 'fa6-brands', name: 'apple', query: '苹果' },
        { prefix: 'logos', name: 'microsoft-windows', query: '微软' },
        { prefix: 'logos', name: 'netflix-icon', query: '奈飞' },
        { prefix: 'logos', name: 'google-workspace', query: '谷歌' },
        { prefix: 'simple-icons', name: 'adobe', query: '奥多比' },
        { prefix: 'streamline-logos', name: 'ubisoft-logo', query: '育碧' },
        { prefix: 'arcticons', name: 'minecraft-alt-2', query: '我的世界 2' },
        { prefix: 'arcticons', name: 'google-play', query: '谷歌' },
        { prefix: 'file-icons', name: 'edge', query: 'edge' },
        { prefix: 'bxl', name: 'windows', query: 'windows' },
      ]
      const selectedIds = new Set(cases.map(({ prefix, name }) => `${prefix}:${name}`))
      const collections = [...new Set(cases.map(({ prefix }) => prefix))].map((prefix) => ({
        prefix,
        collection: prefix,
        palette: false,
        icons: cases.filter((entry) => entry.prefix === prefix).map(({ name }) => name),
        aliases: {},
      }))
      const result = await buildIconSearchArtifacts({
        collections,
        iconPackageVersion: 'test',
        maintained: {
          ...maintained,
          translations: maintained.translations.filter(
            (record) => record.kind === 'icon' && selectedIds.has(record.owner),
          ),
        },
        outputDirectory,
      })
      const { documents } = await readIconSearchArtifacts(outputDirectory)
      await replaceIconSearchDocuments(db, documents, {
        indexVersion: result.manifest.indexVersion,
        iconPackageVersion: 'test',
        searchDataVersion: maintained.dataVersion,
        rulesVersion: result.manifest.rulesVersion,
      })

      const selector = createIconSearchService(db)
      for (const { prefix, name, query } of cases) {
        const result = await selector.searchIcons({ keyword: query, limit: 20 })
        expect(result.list.map((item) => item.icon)).toContain(`${prefix}:${name}`)
      }
      const microsoft = await selector.searchIcons({ keyword: '微软', limit: 20 })
      expect(microsoft.list.map((item) => item.icon)).not.toContain('file-icons:edge')
      expect(microsoft.list.map((item) => item.icon)).not.toContain('bxl:windows')
      const playback = await selector.searchIcons({ keyword: '播放', limit: 20 })
      expect(playback.list.map((item) => item.icon)).not.toContain('arcticons:google-play')
    },
  )

  dbTest(
    'indexes reviewed aliases, UI terms, technical abbreviations, and flag codes',
    async ({ db }) => {
      const outputDirectory = await mkdtemp(join(tmpdir(), 'icon-search-reviewed-english-'))
      onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))
      const cases = [
        { prefix: 'ant-design', name: 'bold', query: '粗体' },
        { prefix: 'mdi', name: 'color', query: '颜色' },
        { prefix: 'mdi', name: 'to-do', query: '待办' },
        { prefix: 'mdi', name: 'api', query: '应用程序编程接口' },
        { prefix: 'mdi', name: 'cpu-32-bit', query: '中央处理器' },
        { prefix: 'fluent', name: 'color-16-filled', query: '颜色' },
        { prefix: 'ion', name: 'construct', query: '构建' },
        { prefix: 'circle-flags', name: 'in', query: '印度' },
        { prefix: 'cil', name: 'account-logout', query: '账户 登出' },
        { prefix: 'oi', name: 'account-logout', query: '账户 登出' },
        {
          prefix: 'material-symbols',
          name: 'brand-awareness-outline-rounded',
          query: '品牌 认知',
        },
        { prefix: 'material-symbols-light', name: 'brand-family', query: '品牌 家族' },
      ]
      const selectedIds = new Set(cases.map(({ prefix, name }) => `${prefix}:${name}`))
      const result = await buildIconSearchArtifacts({
        collections: [
          {
            prefix: 'ant-design',
            collection: 'Ant Design Icons',
            palette: false,
            icons: ['bold-outlined'],
            aliases: { bold: { parent: 'bold-outlined' } },
          },
          {
            prefix: 'mdi',
            collection: 'Material Design Icons',
            palette: false,
            icons: ['api', 'cpu-32-bit', 'format-list-checks', 'palette'],
            aliases: {
              color: { parent: 'palette' },
              'to-do': { parent: 'format-list-checks' },
            },
          },
          {
            prefix: 'fluent',
            collection: 'Fluent UI System Icons',
            palette: false,
            icons: ['color-16-filled'],
            aliases: {},
          },
          {
            prefix: 'ion',
            collection: 'IonIcons',
            palette: false,
            icons: ['construct'],
            aliases: {},
          },
          {
            prefix: 'circle-flags',
            collection: 'Circle Flags',
            palette: false,
            icons: ['in'],
            aliases: {},
          },
          {
            prefix: 'cil',
            collection: 'CoreUI Icons',
            palette: false,
            icons: ['account-logout'],
            aliases: {},
          },
          {
            prefix: 'oi',
            collection: 'Open Iconic',
            palette: false,
            icons: ['account-logout'],
            aliases: {},
          },
          {
            prefix: 'material-symbols',
            collection: 'Material Symbols',
            palette: false,
            icons: ['brand-awareness-outline-rounded'],
            aliases: {},
          },
          {
            prefix: 'material-symbols-light',
            collection: 'Material Symbols Light',
            palette: false,
            icons: ['brand-family'],
            aliases: {},
          },
        ],
        iconPackageVersion: 'test',
        maintained: {
          ...maintained,
          translations: maintained.translations.filter(
            (record) => record.kind === 'icon' && selectedIds.has(record.owner),
          ),
        },
        outputDirectory,
      })
      const { documents } = await readIconSearchArtifacts(outputDirectory)
      await replaceIconSearchDocuments(db, documents, {
        indexVersion: result.manifest.indexVersion,
        iconPackageVersion: 'test',
        searchDataVersion: maintained.dataVersion,
        rulesVersion: result.manifest.rulesVersion,
      })

      const selector = createIconSearchService(db)
      for (const { prefix, name, query } of cases) {
        const result = await selector.searchIcons({ keyword: query, limit: 20 })
        expect(result.list.map((item) => item.icon)).toContain(`${prefix}:${name}`)
      }
    },
  )

  dbTest('keeps cellular network and table cell meanings separate', async ({ db }) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'icon-search-cell-context-'))
    onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))
    const names = ['cell-merge', 'cell-tower']
    const selectedIds = new Set(names.map((name) => `material-symbols:${name}`))
    const result = await buildIconSearchArtifacts({
      collections: [
        {
          prefix: 'material-symbols',
          collection: 'Material Symbols',
          palette: false,
          icons: names,
          aliases: {},
        },
      ],
      iconPackageVersion: 'test',
      maintained: {
        ...maintained,
        translations: maintained.translations.filter(
          (record) => record.kind === 'icon' && selectedIds.has(record.owner),
        ),
      },
      outputDirectory,
    })
    const { documents } = await readIconSearchArtifacts(outputDirectory)
    await replaceIconSearchDocuments(db, documents, {
      indexVersion: result.manifest.indexVersion,
      iconPackageVersion: 'test',
      searchDataVersion: maintained.dataVersion,
      rulesVersion: result.manifest.rulesVersion,
    })

    const selector = createIconSearchService(db)
    await expect(selector.searchIcons({ keyword: '蜂窝网络', limit: 10 })).resolves.toEqual({
      list: [expect.objectContaining({ icon: 'material-symbols:cell-tower' })],
    })
    await expect(selector.searchIcons({ keyword: '单元格', limit: 10 })).resolves.toEqual({
      list: [expect.objectContaining({ icon: 'material-symbols:cell-merge' })],
    })
  })

  dbTest(
    'indexes common object names across the maintained general-purpose sets',
    async ({ db }) => {
      const outputDirectory = await mkdtemp(join(tmpdir(), 'icon-search-general-chinese-'))
      onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))
      const cases = [
        { prefix: 'lucide', name: 'calendar', query: '日历' },
        { prefix: 'tabler', name: 'database', query: '数据库' },
        { prefix: 'mdi', name: 'cart', query: '购物车' },
        { prefix: 'material-symbols', name: 'folder', query: '文件夹' },
        { prefix: 'ph', name: 'user', query: '用户' },
        { prefix: 'solar', name: 'calendar-linear', query: '日历' },
        { prefix: 'heroicons', name: 'camera', query: '相机' },
        { prefix: 'carbon', name: 'data-table', query: '数据表' },
        { prefix: 'fa6-solid', name: 'bug', query: '虫子' },
        { prefix: 'twemoji', name: 'red-paper-lantern', query: '红灯笼' },
      ]
      const selectedIds = new Set(cases.map(({ prefix, name }) => `${prefix}:${name}`))

      const result = await buildIconSearchArtifacts({
        collections: cases.map(({ prefix, name }) => ({
          prefix,
          collection: prefix,
          palette: false,
          icons: [name],
          aliases: {},
        })),
        iconPackageVersion: 'test',
        maintained: {
          ...maintained,
          translations: maintained.translations.filter(
            (record) => record.kind === 'icon' && selectedIds.has(record.owner),
          ),
        },
        outputDirectory,
      })
      const { documents } = await readIconSearchArtifacts(outputDirectory)
      await replaceIconSearchDocuments(db, documents, {
        indexVersion: result.manifest.indexVersion,
        iconPackageVersion: 'test',
        searchDataVersion: maintained.dataVersion,
        rulesVersion: result.manifest.rulesVersion,
      })

      const selector = createIconSearchService(db)
      for (const { prefix, name, query } of cases) {
        const result = await selector.searchIcons({ keyword: query, limit: 10 })
        expect(result.list.map((item) => item.icon)).toContain(`${prefix}:${name}`)
      }
      await expect(selector.searchIcons({ keyword: '通知', limit: 10 })).resolves.toEqual({
        list: [],
      })
      const errorResults = await selector.searchIcons({ keyword: '错误', limit: 10 })
      expect(errorResults.list.map((item) => item.icon)).not.toContain('fa6-solid:bug')
    },
  )

  dbTest(
    'serves the same scoped Chinese terms through selector and library search',
    async ({ db }) => {
      const outputDirectory = await mkdtemp(join(tmpdir(), 'icon-search-chinese-'))
      onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))
      const selectedIds = new Set(['lucide:bell', 'mdi:account', 'mdi:account-alert'])
      const selectedTranslations = maintained.translations.filter((record) =>
        record.kind === 'icon' ? selectedIds.has(record.owner) : record.owner.prefix === 'mdi',
      )
      const result = await buildIconSearchArtifacts({
        collections: [
          {
            prefix: 'lucide',
            collection: 'Lucide',
            palette: false,
            icons: ['bell'],
            aliases: {},
          },
          {
            prefix: 'mdi',
            collection: 'Material Design Icons',
            palette: false,
            icons: ['account', 'account-alert', 'account-box'],
            aliases: {},
            categories: { 'Account / User': ['account', 'account-alert', 'account-box'] },
          },
        ],
        iconPackageVersion: 'test',
        maintained: {
          ...maintained,
          translations: selectedTranslations,
        },
        outputDirectory,
      })
      const { documents } = await readIconSearchArtifacts(outputDirectory)
      await replaceIconSearchDocuments(db, documents, {
        indexVersion: result.manifest.indexVersion,
        iconPackageVersion: 'test',
        searchDataVersion: maintained.dataVersion,
        rulesVersion: result.manifest.rulesVersion,
      })

      const selector = createIconSearchService(db)
      const selectorBell = await selector.searchIcons({ keyword: '铃铛', limit: 10 })
      const libraryBell = await listBuiltinIcons(
        { keyword: '铃铛', prefix: 'lucide', cursor: undefined, pageSize: 10 },
        db,
      )
      expect(selectorBell.list.map((item) => item.icon)).toEqual(['lucide:bell'])
      expect(libraryBell.list.map((item) => item.icon)).toEqual(
        selectorBell.list.map((item) => item.icon),
      )
      await expect(
        selector.searchIcons({ keyword: 'lucide 铃铛', limit: 10 }),
      ).resolves.toMatchObject({
        list: [{ icon: 'lucide:bell' }],
      })
      const selectorAccounts = await selector.searchIcons({ keyword: '账户 用户', limit: 10 })
      expect(selectorAccounts).toMatchObject({
        list: [{ icon: 'mdi:account' }, { icon: 'mdi:account-alert' }, { icon: 'mdi:account-box' }],
      })
      const libraryAccounts = await listBuiltinIcons(
        { keyword: '账户 用户', prefix: 'mdi', cursor: undefined, pageSize: 10 },
        db,
      )
      expect(libraryAccounts.list.map((item) => item.icon)).toEqual(
        selectorAccounts.list.map((item) => item.icon),
      )
      await expect(searchIconDocuments(db, { query: '铃铛', limit: 10 })).resolves.toMatchObject({
        rows: [{ id: 'lucide:bell', level: 0 }],
      })
      await expect(searchIconDocuments(db, { query: '账户', limit: 10 })).resolves.toMatchObject({
        rows: [
          { id: 'mdi:account', level: 0 },
          { id: 'mdi:account-alert', level: 1 },
          { id: 'mdi:account-box', level: 1 },
        ],
      })
      await expect(selector.searchIcons({ keyword: '通知', limit: 10 })).resolves.toEqual({
        list: [],
      })
      await expect(selector.searchIcons({ keyword: 'notification', limit: 10 })).resolves.toEqual({
        list: [],
      })
    },
  )
})
