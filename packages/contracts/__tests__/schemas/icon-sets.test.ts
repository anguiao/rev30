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
  iconSetRenameIconSchema,
  customIconUploadSkippedSchema,
  customIconUploadFailedSchema,
  customIconUploadResponseSchema,
} from '../../src/icons'

describe('icon set schemas', () => {
  it('limits input prefixes and renamed icons to 256 characters', () => {
    const prefix = 'p'.repeat(256)
    const name = 'n'.repeat(256)

    expect(customIconSetFormSchema.parse({ prefix, name: 'Icons', description: null }).prefix).toBe(
      prefix,
    )
    expect(customIconSetCreateSchema.parse({ prefix, name: 'Icons' }).prefix).toBe(prefix)
    expect(iconSetRenameIconSchema.parse({ name }).name).toBe(name)
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
    expectZodIssue(iconSetRenameIconSchema.safeParse({ name: `${name}n` }), {
      path: ['name'],
      message: '图标名称不能超过 256 个字符',
    })
  })

  it('keeps existing long identities readable and addressable', () => {
    const prefix = 'p'.repeat(257)
    const name = 'n'.repeat(257)

    expect(customIconParamSchema.parse({ prefix, name })).toEqual({ prefix, name })
    expect(
      customIconItemSchema.parse({
        icon: `${prefix}:${name}`,
        prefix,
        name,
        setName: 'Icons',
        body: '<path d="M0 0h24v24H0z"/>',
        width: 24,
        height: 24,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
      }).name,
    ).toBe(name)
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
        list: [
          {
            icon: 'lucide:user-add',
            prefix: 'lucide',
            name: 'user-add',
            setName: 'Lucide',
            body: '<path d="M0 0h24v24H0z"/>',
            width: 24,
            height: 24,
          },
        ],
        nextCursor: null,
        pageSize: 80,
      }),
    ).toEqual({
      list: [
        {
          icon: 'lucide:user-add',
          prefix: 'lucide',
          name: 'user-add',
          setName: 'Lucide',
          body: '<path d="M0 0h24v24H0z"/>',
          width: 24,
          height: 24,
        },
      ],
      nextCursor: null,
      pageSize: 80,
    })
  })

  it('parses custom icon set and icon list responses', () => {
    expect(
      customIconSetSchema.parse({
        prefix: 'brand-icons',
        name: 'Brand Icons',
        description: 'Brand assets',
        iconCount: 2,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T01:00:00.000Z',
      }),
    ).toEqual({
      prefix: 'brand-icons',
      name: 'Brand Icons',
      description: 'Brand assets',
      iconCount: 2,
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T01:00:00.000Z',
    })

    expect(
      customIconSetListResponseSchema.parse({
        list: [
          {
            prefix: 'brand-icons',
            name: 'Brand Icons',
            description: 'Brand assets',
            iconCount: 2,
            createdAt: '2026-06-15T00:00:00.000Z',
            updatedAt: '2026-06-15T01:00:00.000Z',
          },
        ],
        total: 1,
      }),
    ).toEqual({
      list: [
        {
          prefix: 'brand-icons',
          name: 'Brand Icons',
          description: 'Brand assets',
          iconCount: 2,
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T01:00:00.000Z',
        },
      ],
      total: 1,
    })

    expect(
      customIconListResponseSchema.parse({
        list: [
          {
            icon: 'brand-icons:user-add',
            prefix: 'brand-icons',
            name: 'user-add',
            setName: 'Brand Icons',
            body: '<path d="M0 0h24v24H0z"/>',
            width: 24,
            height: 24,
            createdAt: '2026-06-15T00:00:00.000Z',
            updatedAt: '2026-06-15T01:00:00.000Z',
          },
        ],
        nextCursor: null,
        pageSize: 80,
      }),
    ).toEqual({
      list: [
        {
          icon: 'brand-icons:user-add',
          prefix: 'brand-icons',
          name: 'user-add',
          setName: 'Brand Icons',
          body: '<path d="M0 0h24v24H0z"/>',
          width: 24,
          height: 24,
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T01:00:00.000Z',
        },
      ],
      nextCursor: null,
      pageSize: 80,
    })
  })

  it('validates duplicate handling and upload responses', () => {
    expect(customIconDuplicateStrategySchema.parse('skip')).toBe('skip')
    expect(customIconDuplicateStrategySchema.parse('replace')).toBe('replace')
    expect(customIconDuplicateStrategySchema.safeParse('overwrite').success).toBe(false)

    expect(iconSetRenameIconSchema.parse({ name: 'user-add' })).toEqual({
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

    expect(
      customIconItemSchema.parse({
        icon: 'brand-icons:user-add',
        prefix: 'brand-icons',
        name: 'user-add',
        setName: 'Brand Icons',
        body: '<path d="M0 0h24v24H0z"/>',
        width: 24,
        height: 24,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T01:00:00.000Z',
      }),
    ).toEqual({
      icon: 'brand-icons:user-add',
      prefix: 'brand-icons',
      name: 'user-add',
      setName: 'Brand Icons',
      body: '<path d="M0 0h24v24H0z"/>',
      width: 24,
      height: 24,
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T01:00:00.000Z',
    })

    expect(
      customIconUploadSkippedSchema.parse({
        name: 'user-add',
        sourceFilename: 'user-add.svg',
        reason: 'duplicate',
      }),
    ).toEqual({
      name: 'user-add',
      sourceFilename: 'user-add.svg',
      reason: 'duplicate',
    })

    expect(
      customIconUploadFailedSchema.parse({
        sourceFilename: 'broken.svg',
        message: 'Invalid SVG',
      }),
    ).toEqual({
      sourceFilename: 'broken.svg',
      message: 'Invalid SVG',
    })

    expect(
      customIconUploadResponseSchema.parse({
        created: [
          {
            icon: 'brand-icons:user-add',
            prefix: 'brand-icons',
            name: 'user-add',
            setName: 'Brand Icons',
            body: '<path d="M0 0h24v24H0z"/>',
            width: 24,
            height: 24,
            createdAt: '2026-06-15T00:00:00.000Z',
            updatedAt: '2026-06-15T01:00:00.000Z',
          },
        ],
        replaced: [],
        skipped: [
          {
            name: 'user-old',
            sourceFilename: 'user-old.svg',
            reason: 'duplicate',
          },
        ],
        failed: [
          {
            sourceFilename: 'broken.svg',
            message: 'Invalid SVG',
          },
        ],
      }),
    ).toEqual({
      created: [
        {
          icon: 'brand-icons:user-add',
          prefix: 'brand-icons',
          name: 'user-add',
          setName: 'Brand Icons',
          body: '<path d="M0 0h24v24H0z"/>',
          width: 24,
          height: 24,
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T01:00:00.000Z',
        },
      ],
      replaced: [],
      skipped: [
        {
          name: 'user-old',
          sourceFilename: 'user-old.svg',
          reason: 'duplicate',
        },
      ],
      failed: [
        {
          sourceFilename: 'broken.svg',
          message: 'Invalid SVG',
        },
      ],
    })
  })
})
