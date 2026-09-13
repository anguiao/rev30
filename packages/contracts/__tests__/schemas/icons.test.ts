import { describe, expect, it } from 'vitest'
import {
  iconDataParamSchema,
  iconDataQuerySchema,
  iconSearchQuerySchema,
  iconSearchResponseSchema,
  iconSetIconListQuerySchema,
  iconSetIconItemSchema,
} from '../../src/icons'

describe('icon schemas', () => {
  it('allows long complete icon ids while keeping ordinary queries within 120 characters', () => {
    const part = 'a'.repeat(121)
    expect(iconSearchQuerySchema.parse({ keyword: `${part}:${part}` }).keyword).toBe(
      `${part}:${part}`,
    )
    expect(iconSetIconListQuerySchema.parse({ keyword: `${part}:${part}` }).keyword).toBe(
      `${part}:${part}`,
    )
    expect(() => iconSearchQuerySchema.parse({ keyword: part })).toThrow('搜索关键词过长')
    expect(() => iconSetIconListQuerySchema.parse({ keyword: part })).toThrow('搜索关键词过长')
  })

  it('accepts opaque bounded icon cursors and rejects oversized cursors', () => {
    expect(iconSetIconListQuerySchema.parse({ cursor: 'opaque-cursor' }).cursor).toBe(
      'opaque-cursor',
    )
    expect(() => iconSetIconListQuerySchema.parse({ cursor: 'a'.repeat(2049) })).toThrow(
      '分页游标无效',
    )
  })

  it('accepts valid built-in icon records whose package body is empty', () => {
    expect(
      iconSetIconItemSchema.parse({
        icon: 'codicon:blank',
        prefix: 'codicon',
        name: 'blank',
        setName: 'Codicons',
        body: '',
        width: 16,
        height: 16,
      }).body,
    ).toBe('')
  })

  it('parses icon data route params into an icon prefix', () => {
    expect(iconDataParamSchema.parse({ filename: 'lucide.json' })).toEqual({
      prefix: 'lucide',
    })

    expect(iconDataParamSchema.parse({ filename: 'heroicons-outline.json' })).toEqual({
      prefix: 'heroicons-outline',
    })
  })

  it('rejects invalid icon data route params', () => {
    expect(iconDataParamSchema.safeParse({ filename: 'Invalid.json' }).success).toBe(false)
    expect(iconDataParamSchema.safeParse({ filename: 'lucide' }).success).toBe(false)
  })

  it('parses icon data query strings', () => {
    expect(
      iconDataQuerySchema.parse({
        icons: 'sun,moon',
        pretty: 'false',
      }),
    ).toEqual({
      icons: ['sun', 'moon'],
      pretty: true,
    })
  })

  it('keeps empty icon names and treats blank pretty as disabled', () => {
    expect(
      iconDataQuerySchema.parse({
        icons: '',
        pretty: '',
      }),
    ).toEqual({
      icons: [''],
      pretty: false,
    })
  })

  it('requires the icons query parameter', () => {
    expect(iconDataQuerySchema.safeParse({}).success).toBe(false)
  })

  it('accepts Iconify Vue icon batches within the URL length budget', () => {
    const icons = ['alpha-one', 'beta-two', 'delta-four', 'epsilon-five', 'gamma-three']

    expect(iconDataQuerySchema.parse({ icons: icons.join(',') }).icons).toEqual(icons)
  })

  it('rejects overlong and malformed icon data queries', () => {
    expect(iconDataQuerySchema.safeParse({ icons: 'a'.repeat(501) }).success).toBe(false)
    expect(iconDataQuerySchema.safeParse({ icons: 'sun,../secret' }).success).toBe(false)
    expect(iconDataQuerySchema.safeParse({ icons: 'sun,,moon' }).success).toBe(false)
  })

  it('parses icon search query defaults and trims the keyword', () => {
    expect(iconSearchQuerySchema.parse({})).toEqual({
      keyword: '',
      limit: 60,
    })

    expect(
      iconSearchQuerySchema.parse({
        keyword: ' 用户 ',
        limit: '24',
      }),
    ).toEqual({
      keyword: '用户',
      limit: 24,
    })
  })

  it('rejects overlong icon search keywords', () => {
    expect(iconSearchQuerySchema.safeParse({ keyword: 'a'.repeat(121) }).success).toBe(false)
  })

  it('clamps icon search limits and rejects invalid limits', () => {
    expect(iconSearchQuerySchema.parse({ limit: '200' }).limit).toBe(100)
    expect(iconSearchQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(iconSearchQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false)
  })

  it('parses icon search responses', () => {
    expect(
      iconSearchResponseSchema.parse({
        list: [
          {
            icon: 'lucide:users',
            prefix: 'lucide',
            name: 'users',
            collection: 'Lucide',
            palette: false,
          },
        ],
      }),
    ).toEqual({
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
  })
})
