import { describe, expect, it } from 'vitest'
import {
  iconDataParamSchema,
  iconDataQuerySchema,
  iconSearchQuerySchema,
  iconSearchResponseSchema,
} from '../../src/schemas/icons'

describe('icon schemas', () => {
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
