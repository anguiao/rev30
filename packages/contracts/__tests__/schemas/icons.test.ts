import { describe, expect, it } from 'vitest'
import { expectZodIssue } from '../helpers/schema'
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

  it.each(['Invalid.json', 'lucide'])('rejects invalid icon data filename %s', (filename) => {
    expectZodIssue(iconDataParamSchema.safeParse({ filename }), {
      message: '图标文件名无效',
      path: ['filename'],
    })
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
    expectZodIssue(iconDataQuerySchema.safeParse({}), { code: 'invalid_type', path: ['icons'] })
  })

  it('accepts icon data at the URL length budget', () => {
    const icons = ['a'.repeat(249), 'b'.repeat(250)]
    expect(icons.join(',')).toHaveLength(500)
    expect(iconDataQuerySchema.parse({ icons: icons.join(',') }).icons).toEqual(icons)
  })

  it.each([
    ['a'.repeat(501), '图标请求过长'],
    ['sun,../secret', '图标名称无效'],
    ['sun,,moon', '图标名称无效'],
  ])('rejects invalid icon data query %s', (icons, message) => {
    expectZodIssue(iconDataQuerySchema.safeParse({ icons }), { message, path: ['icons'] })
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
