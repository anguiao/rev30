import { describe, expect, it, vi } from 'vitest'

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
        'chart-column': {},
        'file-clock': {},
        house: {},
        key: {},
        menu: {},
        package: {},
        settings: {},
        shield: {},
        'shield-check': {},
        user: {},
        'user-cog': {},
        users: {},
        vue: {},
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

const { searchIcons } = await import('../../../src/modules/icons/search-service')

describe('icon search service', () => {
  it('searches recommended icons for an empty keyword', async () => {
    const result = await searchIcons({ keyword: '', limit: 12 })
    const whitespaceResult = await searchIcons({ keyword: '   ', limit: 12 })

    expect(result.list.length).toBeGreaterThan(0)
    expect(result.list.length).toBeLessThanOrEqual(12)
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

    const exact = await searchIcons({ keyword: 'lucide:users', limit: 10 })
    expect(exact.list[0]?.icon).toBe('lucide:users')

    const fuzzy = await searchIcons({ keyword: 'usr', limit: 20 })
    expect(fuzzy.list.some((item) => item.icon.includes('user'))).toBe(true)
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
