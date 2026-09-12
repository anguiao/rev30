import { afterEach, describe, expect, it, vi } from 'vitest'

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

    const { listBuiltinIcons } =
      await import('../../../../../src/modules/content/icon-sets/builtin/service')

    const pageOne = await listBuiltinIcons({
      keyword: undefined,
      prefix: undefined,
      cursor: undefined,
      pageSize: 1,
    })

    expect(pageOne.nextCursor).toBe('alpha:real')
    expect(pageOne.list.map((item) => item.icon)).toEqual(['alpha:real'])

    const pageTwo = await listBuiltinIcons({
      keyword: undefined,
      prefix: undefined,
      cursor: pageOne.nextCursor ?? undefined,
      pageSize: 1,
    })

    expect(pageTwo.nextCursor).toBeNull()
    expect(pageTwo.list.map((item) => item.icon)).toEqual(['beta:second'])
  })
})
