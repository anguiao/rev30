import { afterEach, describe, expect, it, vi } from 'vitest'
import { iconSetIconItemSchema } from '@rev30/contracts'
import { dbTest } from '../../../../fixtures/database'
import { replaceIconSearchDocuments } from '../../../../fixtures/icon-search'

afterEach(() => {
  vi.doUnmock('@iconify/json')
  vi.resetModules()
})

describe('built-in icon browsing', () => {
  dbTest('returns package-defined positive decimal viewBox dimensions', async ({ db }) => {
    vi.resetModules()
    vi.doUnmock('@iconify/json')
    await replaceIconSearchDocuments(
      db,
      [
        {
          id: 'formkit:currency',
          prefix: 'formkit',
          name: 'currency',
          source: 'builtin',
          collection: 'FormKit Icons',
          palette: false,
          customIconId: null,
          exactPhrases: ['currency'],
          primaryTokens: ['currency'],
          fullTokens: ['currency'],
          primaryEnglishTerms: ['currency'],
          auxiliaryEnglishTerms: [],
        },
      ],
      { indexVersion: 'v1', iconPackageVersion: 'v1', searchDataVersion: 'v1', rulesVersion: '3' },
    )
    const { listBuiltinIcons } =
      await import('../../../../../src/modules/content/icon-sets/builtin/service')
    const result = await listBuiltinIcons(
      { keyword: 'currency', prefix: 'formkit', cursor: undefined, pageSize: 10 },
      db,
    )

    expect(result.list[0]).toMatchObject({ width: 25.9, height: 16.8 })
    expect(iconSetIconItemSchema.parse(result.list[0])).toEqual(result.list[0])
  })

  dbTest(
    'returns a package-defined zero-sized viewBox without rejecting the page',
    async ({ db }) => {
      vi.resetModules()
      vi.doUnmock('@iconify/json')
      await replaceIconSearchDocuments(
        db,
        [
          {
            id: 'thesvg-color:logitech-g',
            prefix: 'thesvg-color',
            name: 'logitech-g',
            source: 'builtin',
            collection: 'The SVG Color Icons',
            palette: true,
            customIconId: null,
            exactPhrases: ['logitech-g'],
            primaryTokens: ['logitech', 'g'],
            fullTokens: ['logitech', 'g'],
            primaryEnglishTerms: ['logitech', 'g'],
            auxiliaryEnglishTerms: [],
          },
        ],
        {
          indexVersion: 'v1',
          iconPackageVersion: 'v1',
          searchDataVersion: 'v1',
          rulesVersion: '3',
        },
      )
      const { listBuiltinIcons } =
        await import('../../../../../src/modules/content/icon-sets/builtin/service')
      const result = await listBuiltinIcons(
        { keyword: 'logitech-g', prefix: 'thesvg-color', cursor: undefined, pageSize: 10 },
        db,
      )

      expect(result.list[0]).toMatchObject({ width: 0, height: 0 })
      expect(iconSetIconItemSchema.parse(result.list[0])).toEqual(result.list[0])
    },
  )

  it('uses cursor pagination and excludes aliases for global browsing without a keyword', async () => {
    vi.resetModules()
    const lookupCollectionsMock = vi.fn().mockResolvedValue({
      alpha: {
        name: 'Alpha',
        total: 1,
      },
      beta: {
        name: 'Beta',
        total: 1,
      },
    })
    const lookupCollectionMock = vi.fn(async (prefix: string) => {
      if (prefix === 'alpha') {
        return {
          prefix: 'alpha',
          icons: {
            real: {
              body: '<path d="real" />',
            },
          },
          aliases: {
            alias: {
              parent: 'real',
            },
          },
          width: 24,
          height: 24,
        }
      }

      if (prefix === 'beta') {
        return {
          prefix: 'beta',
          icons: {
            second: {
              body: '<path d="second" />',
            },
          },
          aliases: {},
          width: 24,
          height: 24,
        }
      }

      throw new Error(`Unexpected prefix: ${prefix}`)
    })

    vi.doMock('@iconify/json', () => ({
      lookupCollections: lookupCollectionsMock,
      lookupCollection: lookupCollectionMock,
    }))

    const { browseBuiltinIcons } =
      await import('../../../../../src/modules/content/icon-sets/builtin/service')

    const pageOne = await browseBuiltinIcons({
      keyword: undefined,
      prefix: undefined,
      cursor: undefined,
      pageSize: 1,
    })

    expect(pageOne.nextCursor).not.toBe('alpha:real')
    expect(pageOne.list.map((item) => item.icon)).toEqual(['alpha:real'])

    const pageTwo = await browseBuiltinIcons({
      keyword: undefined,
      prefix: undefined,
      cursor: pageOne.nextCursor ?? undefined,
      pageSize: 1,
    })

    expect(pageTwo.nextCursor).toBeNull()
    expect(pageTwo.list.map((item) => item.icon)).toEqual(['beta:second'])
  })

  it('sorts global browse by complete id byte order and keeps valid empty bodies', async () => {
    vi.resetModules()
    vi.doMock('@iconify/json', () => ({
      lookupCollections: vi
        .fn()
        .mockResolvedValue({ fa: { name: 'FA' }, 'fa-brands': { name: 'FA Brands' } }),
      lookupCollection: vi.fn(async (prefix: string) => ({
        prefix,
        icons: { a: { body: '' } },
        aliases: {},
        width: 16,
        height: 16,
      })),
    }))
    const { browseBuiltinIcons } =
      await import('../../../../../src/modules/content/icon-sets/builtin/service')
    const result = await browseBuiltinIcons({
      keyword: undefined,
      prefix: undefined,
      cursor: undefined,
      pageSize: 10,
    })
    expect(result.list.map((item) => [item.icon, item.body])).toEqual([
      ['fa-brands:a', ''],
      ['fa:a', ''],
    ])
  })

  dbTest('returns transformed aliases whose resolved body is empty', async ({ db }) => {
    vi.resetModules()
    vi.doMock('@iconify/json', () => ({
      lookupCollections: vi.fn().mockResolvedValue({ fa: { name: 'FA' } }),
      lookupCollection: vi.fn(async () => ({
        prefix: 'fa',
        icons: { a: { body: '' } },
        aliases: { blank: { parent: 'a' } },
        width: 16,
        height: 16,
      })),
    }))
    await replaceIconSearchDocuments(
      db,
      [
        {
          id: 'fa:blank',
          prefix: 'fa',
          name: 'blank',
          source: 'builtin',
          collection: 'FA',
          palette: false,
          customIconId: null,
          exactPhrases: ['blank'],
          primaryTokens: ['blank'],
          fullTokens: ['blank'],
          primaryEnglishTerms: ['blank'],
          auxiliaryEnglishTerms: [],
        },
      ],
      { indexVersion: 'v1', iconPackageVersion: 'v1', searchDataVersion: 'v1', rulesVersion: '1' },
    )
    const { listBuiltinIcons } =
      await import('../../../../../src/modules/content/icon-sets/builtin/service')
    const result = await listBuiltinIcons(
      { keyword: 'blank', prefix: 'fa', cursor: undefined, pageSize: 10 },
      db,
    )
    expect(result.list).toEqual([expect.objectContaining({ icon: 'fa:blank', body: '' })])
  })

  dbTest('applies alias flips and rotations to non-square SVG output', async ({ db }) => {
    vi.resetModules()
    vi.doMock('@iconify/json', () => ({
      lookupCollections: vi.fn().mockResolvedValue({ fa: { name: 'FA' } }),
      lookupCollection: vi.fn(async () => ({
        prefix: 'fa',
        icons: {
          triangle: { body: '<path d="M0 0L24 0L0 12Z"/>', width: 24, height: 12 },
        },
        aliases: { turned: { parent: 'triangle', hFlip: true, rotate: 1 } },
        width: 24,
        height: 12,
      })),
    }))
    await replaceIconSearchDocuments(
      db,
      [
        {
          id: 'fa:turned',
          prefix: 'fa',
          name: 'turned',
          source: 'builtin',
          collection: 'FA',
          palette: false,
          customIconId: null,
          exactPhrases: ['turned'],
          primaryTokens: ['turned'],
          fullTokens: ['turned'],
          primaryEnglishTerms: ['turned'],
          auxiliaryEnglishTerms: [],
        },
      ],
      { indexVersion: 'v1', iconPackageVersion: 'v1', searchDataVersion: 'v1', rulesVersion: '2' },
    )
    const { listBuiltinIcons } =
      await import('../../../../../src/modules/content/icon-sets/builtin/service')
    const result = await listBuiltinIcons(
      { keyword: 'turned', prefix: 'fa', cursor: undefined, pageSize: 10 },
      db,
    )

    expect(result.list).toEqual([
      expect.objectContaining({
        icon: 'fa:turned',
        body: '<g transform="rotate(90 6 6) translate(24 0) scale(-1 1)"><path d="M0 0L24 0L0 12Z"/></g>',
        width: 12,
        height: 24,
      }),
    ])
  })
})
