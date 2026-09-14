import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, onTestFinished } from 'vitest'

import { listBuiltinIcons } from '../../../../src/modules/content/icon-sets/builtin/service'
import {
  buildIconSearchArtifacts,
  readIconSearchArtifacts,
} from '../../../../src/modules/icons/search/artifacts'
import { createIconSearchService } from '../../../../src/modules/icons/search/service'
import { loadMaintainedSearchData } from '../../../../src/modules/icons/search/maintenance'
import {
  replaceIconSearchDocuments,
  searchIconDocuments,
} from '../../../../src/modules/icons/search/repository'
import { dbTest } from '../../../fixtures/database'

describe('maintained Chinese icon search', () => {
  dbTest('keeps cellular network and table cell meanings separate', async ({ db }) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'icon-search-cell-context-'))
    onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))
    const maintained = await loadMaintainedSearchData(join(process.cwd(), 'resources/icon-search'))
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
        english: maintained.english.filter((record) => selectedIds.has(record.owner)),
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
      const maintained = await loadMaintainedSearchData(
        join(process.cwd(), 'resources/icon-search'),
      )
      const cases = [
        { prefix: 'lucide', name: 'calendar', query: '日历' },
        { prefix: 'tabler', name: 'database', query: '数据库' },
        { prefix: 'mdi', name: 'cart', query: '购物车' },
        { prefix: 'material-symbols', name: 'folder', query: '文件夹' },
        { prefix: 'ph', name: 'user', query: '用户' },
        { prefix: 'solar', name: 'calendar-linear', query: '日历' },
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
          english: maintained.english.filter((record) => selectedIds.has(record.owner)),
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
    },
  )

  dbTest(
    'serves the same scoped Chinese terms through selector and library search',
    async ({ db }) => {
      const outputDirectory = await mkdtemp(join(tmpdir(), 'icon-search-chinese-'))
      onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))
      const maintained = await loadMaintainedSearchData(
        join(process.cwd(), 'resources/icon-search'),
      )
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
          english: maintained.english.filter((record) => selectedIds.has(record.owner)),
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
        list: [{ icon: 'mdi:account' }, { icon: 'mdi:account-alert' }],
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
