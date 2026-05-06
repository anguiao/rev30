import { describe, expect, it } from 'vitest'
import { iconDataParamSchema, iconDataQuerySchema } from '../../src/schemas/icons'

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
})
