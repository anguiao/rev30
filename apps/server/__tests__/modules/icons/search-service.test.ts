import { lookupCollection } from '@iconify/json'
import { describe, expect, it, vi } from 'vitest'
import { getIconSubset } from '../../../src/modules/icons/service'

vi.mock('@iconify/json', () => {
  const collections = {
    lucide: {
      name: 'Lucide',
      palette: false,
    },
    logos: {
      name: 'Logos',
      palette: true,
    },
  }
  const iconSets = {
    lucide: {
      icons: {
        'bar-chart': {},
        bell: {},
        'book-open': {},
        'building-2': {},
        boxes: {},
        calendar: {},
        'chart-column': {},
        'circle-check': {},
        'circle-minus': {},
        'circle-plus': {},
        'circle-x': {},
        'clipboard-list': {},
        clock: {},
        database: {},
        download: {},
        'external-link': {},
        'file-clock': {},
        'file-chart-column': {},
        'file-text': {},
        filter: {},
        'folder-tree': {},
        globe: {},
        history: {},
        house: {},
        key: {},
        'key-round': {},
        'layout-dashboard': {},
        link: {},
        list: {},
        'list-ordered': {},
        'list-tree': {},
        'lock-keyhole': {},
        logs: {},
        mail: {},
        menu: {},
        'message-square': {},
        network: {},
        package: {},
        'panel-left': {},
        'refresh-cw': {},
        route: {},
        'rows-3': {},
        search: {},
        send: {},
        server: {},
        settings: {},
        shield: {},
        'shield-alert': {},
        'shield-check': {},
        'sliders-horizontal': {},
        'square-pen': {},
        'trash-2': {},
        'unlock-keyhole': {},
        upload: {},
        user: {},
        'user-check': {},
        'user-cog': {},
        'user-plus': {},
        'user-round': {},
        users: {},
        vue: {},
        workflow: {},
        wrench: {},
      },
      aliases: {
        account: { parent: 'user' },
      },
    },
    logos: {
      icons: {
        vue: {},
      },
      aliases: {},
    },
  }

  return {
    lookupCollections: vi.fn(async () => collections),
    lookupCollection: vi.fn(async (prefix: keyof typeof iconSets) => iconSets[prefix]),
  }
})

vi.mock('../../../src/modules/icons/service', () => ({
  getIconSubset: vi.fn(),
}))

const { searchIcons } = await import('../../../src/modules/icons/search')
const getIconSubsetMock = vi.mocked(getIconSubset)
const lookupCollectionMock = vi.mocked(lookupCollection)

describe('icon search service', () => {
  it('resolves exact icon names without building the search index', async () => {
    lookupCollectionMock.mockClear()
    getIconSubsetMock.mockResolvedValueOnce({
      prefix: 'lucide',
      icons: {
        users: {
          body: '<path d="users" />',
        },
      },
      aliases: {},
    })

    const result = await searchIcons({ keyword: 'lucide:users', limit: 10 })

    expect(result).toEqual({
      list: [
        {
          icon: 'lucide:users',
          prefix: 'lucide',
          name: 'users',
          collection: 'Lucide',
          palette: false,
        },
      ],
    })
    expect(getIconSubsetMock).toHaveBeenCalledWith('lucide', ['users'])
    expect(lookupCollectionMock).not.toHaveBeenCalled()
  })

  it('returns an empty list for missing exact icon names without building the search index', async () => {
    lookupCollectionMock.mockClear()
    getIconSubsetMock.mockResolvedValueOnce({
      prefix: 'lucide',
      icons: {},
      aliases: {},
      not_found: ['not-real'],
    })

    const result = await searchIcons({ keyword: 'lucide:not-real', limit: 10 })

    expect(result).toEqual({ list: [] })
    expect(getIconSubsetMock).toHaveBeenCalledWith('lucide', ['not-real'])
    expect(lookupCollectionMock).not.toHaveBeenCalled()
  })

  it('fills the default recommendation limit for an empty keyword', async () => {
    const result = await searchIcons({ keyword: '', limit: 60 })
    const whitespaceResult = await searchIcons({ keyword: '   ', limit: 60 })

    expect(result.list).toHaveLength(60)
    expect(result.list.some((item) => item.icon === 'lucide:users')).toBe(true)
    expect(whitespaceResult.list.map((item) => item.icon)).toEqual(
      result.list.map((item) => item.icon),
    )
  })

  it('searches icons by English, Chinese, alias, exact, and fuzzy keywords', async () => {
    const english = await searchIcons({ keyword: 'user', limit: 20 })
    expect(english.list[0]?.icon).toBe('lucide:user')

    const settings = await searchIcons({ keyword: 'settings', limit: 20 })
    expect(settings.list[0]?.icon).toBe('lucide:settings')

    const chinese = await searchIcons({ keyword: '用户', limit: 20 })
    expect(chinese.list.some((item) => item.icon === 'lucide:users')).toBe(true)

    const combinedChinese = await searchIcons({ keyword: '用户权限', limit: 40 })
    expect(
      combinedChinese.list.some(
        (item) =>
          item.icon.includes('user') || item.icon.includes('shield') || item.icon.includes('key'),
      ),
    ).toBe(true)

    const alias = await searchIcons({ keyword: 'person', limit: 20 })
    expect(alias.list.some((item) => item.icon === 'lucide:user')).toBe(true)

    getIconSubsetMock.mockResolvedValueOnce({
      prefix: 'lucide',
      icons: {
        users: {
          body: '<path d="users" />',
        },
      },
      aliases: {},
    })
    const exact = await searchIcons({ keyword: 'lucide:users', limit: 10 })
    expect(exact.list[0]?.icon).toBe('lucide:users')

    const fuzzy = await searchIcons({ keyword: 'usr', limit: 20 })
    expect(fuzzy.list.some((item) => item.icon.includes('user'))).toBe(true)
  })

  it('keeps icon set prefixes searchable without search text copies', async () => {
    const result = await searchIcons({ keyword: 'lucide', limit: 20 })

    expect(result.list.length).toBeGreaterThan(0)
    expect(result.list.every((item) => item.prefix === 'lucide')).toBe(true)
  })

  it('searches broad Chinese keywords with bounded candidate expansion', async () => {
    const result = await searchIcons({
      keyword:
        '用户角色权限菜单资源部门组织系统设置日志首页统计报表字典通知文件外链操作状态排序配置',
      limit: 20,
    })

    expect(result.list.length).toBeGreaterThan(0)
    expect(result.list.length).toBeLessThanOrEqual(20)
    expect(
      result.list.some((item) => item.icon.includes('user') || item.icon.includes('shield')),
    ).toBe(true)
  })

  it('keeps color and brand icons searchable while preferring monochrome admin icon sets', async () => {
    const result = await searchIcons({ keyword: 'vue', limit: 80 })
    const colorIndex = result.list.findIndex((item) => item.prefix === 'logos')
    const monochromeIndex = result.list.findIndex((item) => !item.palette)

    expect(colorIndex).toBeGreaterThanOrEqual(0)
    expect(monochromeIndex).toBeGreaterThanOrEqual(0)
    expect(monochromeIndex).toBeLessThan(colorIndex)
  })
})
