import { describe, expect, it } from 'vitest'
import { expectZodIssue } from '../helpers/schema'
import {
  iconSetIconListQuerySchema,
  iconSetListQuerySchema,
  iconSetPrefixParamSchema,
  iconSetIconItemSchema,
  builtinIconSetListResponseSchema,
  builtinIconListResponseSchema,
  customIconSetSchema,
  customIconSetListResponseSchema,
  customIconParamSchema,
  customIconItemSchema,
  customIconListResponseSchema,
  customIconSetFormSchema,
  customIconSetCreateSchema,
  customIconSetUpdateSchema,
  customIconDuplicateStrategySchema,
  customIconUploadResponseSchema,
  customIconKeywordsSchema,
  customIconUploadMetadataSchema,
  customIconUpdateSchema,
  customIconFormSchema,
  CUSTOM_ICON_KEYWORD_MAX_LENGTH,
  CUSTOM_ICON_KEYWORDS_MAX_ITEMS,
} from '../../src/icons'

const builtinIcon = {
  icon: 'lucide:user-add',
  prefix: 'lucide',
  name: 'user-add',
  setName: 'Lucide',
  body: '<path d="M0 0h24v24H0z"/>',
  width: 24,
  height: 24,
}

const customIconSet = {
  prefix: 'brand-icons',
  name: 'Brand Icons',
  description: 'Brand assets',
  iconCount: 2,
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T01:00:00.000Z',
}

const customIcon = {
  icon: 'brand-icons:user-add',
  prefix: 'brand-icons',
  name: 'user-add',
  setName: 'Brand Icons',
  body: '<path d="M0 0h24v24H0z"/>',
  width: 24,
  height: 24,
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T01:00:00.000Z',
  keywords: [],
}

describe('icon set schemas', () => {
  it('normalizes and deduplicates custom icon keywords while preserving readable input', () => {
    expect(
      customIconKeywordsSchema.parse([
        '  File Manager  ',
        'ｆｉｌｅ\u3000manager',
        '图标 搜索',
        'ⓐ',
        'A',
        '¨a',
        '\u0308a',
      ]),
    ).toEqual(['File Manager', '图标 搜索', 'ⓐ', '¨a'])
    expect(customIconKeywordsSchema.parse([])).toEqual([])
  })

  it('enforces custom icon keyword item and collection bounds', () => {
    expectZodIssue(customIconKeywordsSchema.safeParse(['---']), {
      path: [0],
      message: '关键词必须包含文字或数字',
    })
    expectZodIssue(
      customIconKeywordsSchema.safeParse(['x'.repeat(CUSTOM_ICON_KEYWORD_MAX_LENGTH + 1)]),
      {
        path: [0],
        message: '关键词不能超过 40 个字符',
      },
    )
    expectZodIssue(
      customIconKeywordsSchema.safeParse(
        Array.from(
          { length: CUSTOM_ICON_KEYWORDS_MAX_ITEMS + 1 },
          (_, index) => `keyword-${index}`,
        ),
      ),
      { path: [], message: '关键词不能超过 20 项' },
    )
  })

  it('validates positional upload metadata and icon updates', () => {
    expect(customIconUploadMetadataSchema.parse([{ keywords: ['  Logo  '] }, {}])).toEqual([
      { keywords: ['Logo'] },
      {},
    ])
    expect(customIconUpdateSchema.parse({ keywords: [] })).toEqual({ keywords: [] })
    expect(customIconUpdateSchema.parse({ name: 'brand', keywords: [' mark '] })).toEqual({
      name: 'brand',
      keywords: ['mark'],
    })
    expectZodIssue(customIconUpdateSchema.safeParse({}), {
      path: [],
      message: '至少修改一个字段',
    })
  })

  it('normalizes icon edit form values and requires a valid name', () => {
    expect(customIconFormSchema.parse({ name: '  brand  ', keywords: [' Logo ', 'logo'] })).toEqual(
      {
        name: 'brand',
        keywords: ['Logo'],
      },
    )
    expectZodIssue(customIconFormSchema.safeParse({ name: '  ', keywords: [] }), {
      path: ['name'],
      message: '图标名称无效',
    })
  })

  it('limits input prefixes and renamed icons to 256 characters', () => {
    const prefix = 'p'.repeat(256)
    const name = 'n'.repeat(256)

    expect(customIconSetFormSchema.parse({ prefix, name: 'Icons', description: null }).prefix).toBe(
      prefix,
    )
    expect(customIconSetCreateSchema.parse({ prefix, name: 'Icons' }).prefix).toBe(prefix)
    expect(customIconUpdateSchema.parse({ name }).name).toBe(name)
    expectZodIssue(
      customIconSetFormSchema.safeParse({ prefix: `${prefix}p`, name: 'Icons', description: null }),
      {
        path: ['prefix'],
        message: '图标集前缀不能超过 256 个字符',
      },
    )
    expectZodIssue(customIconSetCreateSchema.safeParse({ prefix: `${prefix}p`, name: 'Icons' }), {
      path: ['prefix'],
      message: '图标集前缀不能超过 256 个字符',
    })
    expectZodIssue(customIconUpdateSchema.safeParse({ name: `${name}n` }), {
      path: ['name'],
      message: '图标名称不能超过 256 个字符',
    })
  })

  it('parses icon set list query defaults', () => {
    expect(iconSetListQuerySchema.parse({})).toEqual({
      keyword: undefined,
    })
  })

  it('parses icon set icon list query values', () => {
    expect(
      iconSetIconListQuerySchema.parse({
        keyword: ' user ',
        prefix: 'lucide',
        cursor: 'lucide:user-add',
        pageSize: '80',
      }),
    ).toEqual({
      keyword: 'user',
      prefix: 'lucide',
      cursor: 'lucide:user-add',
      pageSize: 80,
    })
  })

  it('validates icon set route params', () => {
    expect(iconSetPrefixParamSchema.parse({ prefix: 'brand-icons' })).toEqual({
      prefix: 'brand-icons',
    })

    expect(customIconParamSchema.parse({ prefix: 'brand-icons', name: 'user-add' })).toEqual({
      prefix: 'brand-icons',
      name: 'user-add',
    })
  })

  it('rejects invalid icon set route params', () => {
    expect(iconSetPrefixParamSchema.safeParse({ prefix: 'Lucide' }).success).toBe(false)
    expect(
      customIconParamSchema.safeParse({ prefix: 'brand-icons', name: '../user' }).success,
    ).toBe(false)
  })

  it('validates custom icon set create and update inputs', () => {
    expect(
      customIconSetFormSchema.parse({
        prefix: 'brand-icons',
        name: 'Brand Icons',
        description: '',
      }),
    ).toEqual({
      prefix: 'brand-icons',
      name: 'Brand Icons',
      description: null,
    })

    expect(
      customIconSetCreateSchema.parse({
        prefix: 'brand-icons',
        name: 'Brand Icons',
        description: '  A curated set  ',
      }),
    ).toEqual({
      prefix: 'brand-icons',
      name: 'Brand Icons',
      description: 'A curated set',
    })

    expect(
      customIconSetUpdateSchema.parse({
        name: 'Updated Icons',
      }),
    ).toEqual({
      name: 'Updated Icons',
    })

    expect(
      customIconSetUpdateSchema.parse({
        description: null,
      }),
    ).toEqual({
      description: null,
    })

    expect(customIconSetUpdateSchema.safeParse({}).success).toBe(false)
  })

  it('parses built-in icon set and icon list responses', () => {
    expect(
      builtinIconSetListResponseSchema.parse({
        list: [
          {
            prefix: 'lucide',
            name: 'Lucide',
            total: 2,
          },
        ],
        total: 1,
      }),
    ).toEqual({
      list: [
        {
          prefix: 'lucide',
          name: 'Lucide',
          total: 2,
        },
      ],
      total: 1,
    })

    expect(
      builtinIconListResponseSchema.parse({
        list: [builtinIcon],
        nextCursor: null,
        pageSize: 80,
      }),
    ).toEqual({
      list: [builtinIcon],
      nextCursor: null,
      pageSize: 80,
    })
  })

  it('parses custom icon set and icon list responses', () => {
    expect(customIconSetSchema.parse(customIconSet)).toEqual(customIconSet)

    expect(
      customIconSetListResponseSchema.parse({
        list: [customIconSet],
        total: 1,
      }),
    ).toEqual({
      list: [customIconSet],
      total: 1,
    })

    expect(
      customIconListResponseSchema.parse({
        list: [customIcon],
        nextCursor: null,
        pageSize: 80,
      }),
    ).toEqual({
      list: [customIcon],
      nextCursor: null,
      pageSize: 80,
    })
  })

  it('validates duplicate handling and upload responses', () => {
    expect(customIconDuplicateStrategySchema.parse('skip')).toBe('skip')
    expect(customIconDuplicateStrategySchema.parse('replace')).toBe('replace')
    expect(customIconDuplicateStrategySchema.safeParse('overwrite').success).toBe(false)

    expect(customIconUpdateSchema.parse({ name: 'user-add' })).toEqual({
      name: 'user-add',
    })

    expect(
      iconSetIconItemSchema.parse({
        icon: 'brand-icons:user-add',
        prefix: 'brand-icons',
        name: 'user-add',
        setName: 'Brand Icons',
        body: '<path d="M0 0h24v24H0z"/>',
        width: 24,
        height: 24,
      }),
    ).toEqual({
      icon: 'brand-icons:user-add',
      prefix: 'brand-icons',
      name: 'user-add',
      setName: 'Brand Icons',
      body: '<path d="M0 0h24v24H0z"/>',
      width: 24,
      height: 24,
    })

    expect(customIconItemSchema.parse(customIcon)).toEqual(customIcon)

    const response = {
      results: [
        { status: 'created', icon: customIcon },
        { status: 'skipped', name: 'user-old', reason: 'duplicate' },
        { status: 'failed', message: 'Invalid SVG' },
        { status: 'replaced', icon: customIcon },
      ],
    }
    expect(customIconUploadResponseSchema.parse(response)).toEqual(response)
  })
})
