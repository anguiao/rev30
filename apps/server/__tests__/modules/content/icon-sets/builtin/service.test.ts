import { afterEach, describe, expect, it, vi } from 'vitest'
import { dbTest } from '../../../../fixtures/database'
import { replaceIconSearchDocuments } from '../../../../../src/modules/icons/search/repository'

afterEach(() => {
  vi.doUnmock('../../../../../src/modules/icons/search/collections')
  vi.doUnmock('@iconify/json')
  vi.resetModules()
})

describe('built-in icon browsing', () => {
  it('uses cursor pagination and excludes aliases for global browsing without a keyword', async () => {
    vi.resetModules()
    const loadIconCollectionsMock = vi.fn().mockResolvedValue({
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

    vi.doMock('../../../../../src/modules/icons/search/collections', () => ({
      loadIconCollections: loadIconCollectionsMock,
    }))
    vi.doMock('@iconify/json', () => ({
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
    vi.doMock('../../../../../src/modules/icons/search/collections', () => ({
      loadIconCollections: vi
        .fn()
        .mockResolvedValue({ fa: { name: 'FA' }, 'fa-brands': { name: 'FA Brands' } }),
    }))
    vi.doMock('@iconify/json', () => ({
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
    vi.doMock('../../../../../src/modules/icons/search/collections', () => ({
      loadIconCollections: vi.fn().mockResolvedValue({ fa: { name: 'FA' } }),
    }))
    vi.doMock('@iconify/json', () => ({
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
})
