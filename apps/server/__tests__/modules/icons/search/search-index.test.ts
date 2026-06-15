import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchIndex } from '../../../../src/modules/icons/search/types'

type SearchIndexModule = typeof import('../../../../src/modules/icons/search/search-index') & {
  buildCustomSearchIndex?: (
    items: Array<{ collection: string; name: string; palette: boolean; prefix: string }>,
  ) => SearchIndex
  mergeSearchItems?: unknown
}

const mocks = vi.hoisted(() => ({
  getIconSubset: vi.fn(),
  lookupCollection: vi.fn(),
  lookupCollections: vi.fn(),
}))

vi.mock('@iconify/json', () => ({
  lookupCollection: mocks.lookupCollection,
  lookupCollections: mocks.lookupCollections,
}))

vi.mock('../../../../src/modules/icons/service', () => ({
  getIconSubset: mocks.getIconSubset,
}))

describe('icon search index lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    mocks.getIconSubset.mockReset()
    mocks.lookupCollection.mockReset()
    mocks.lookupCollections.mockReset()
    mocks.lookupCollections.mockResolvedValue({
      lucide: {
        name: 'Lucide',
        palette: false,
      },
    })
    mocks.lookupCollection.mockResolvedValue({
      prefix: 'lucide',
      icons: {
        home: {},
        settings: {},
        user: {},
        users: {},
      },
      aliases: {},
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('evicts the search index after the configured idle TTL', async () => {
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', '50')

    const { searchIcons } = await import('../../../../src/modules/icons/search')

    await searchIcons({ keyword: 'user', limit: 10 })
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)

    mocks.lookupCollection.mockClear()
    await vi.advanceTimersByTimeAsync(51)

    await searchIcons({ keyword: 'settings', limit: 10 })
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)
  })

  it('refreshes the idle TTL when the existing search index is reused', async () => {
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', '50')

    const { searchIcons } = await import('../../../../src/modules/icons/search')

    await searchIcons({ keyword: 'user', limit: 10 })
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)

    mocks.lookupCollection.mockClear()
    await vi.advanceTimersByTimeAsync(49)
    await searchIcons({ keyword: 'settings', limit: 10 })
    expect(mocks.lookupCollection).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(49)
    await searchIcons({ keyword: 'home', limit: 10 })
    expect(mocks.lookupCollection).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(51)
    await searchIcons({ keyword: 'user', limit: 10 })
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)
  })

  it('keeps the search index while idle cleanup is disabled', async () => {
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', '0')

    const { searchIcons } = await import('../../../../src/modules/icons/search')

    await searchIcons({ keyword: 'user', limit: 10 })
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)

    mocks.lookupCollection.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    await searchIcons({ keyword: 'settings', limit: 10 })

    expect(mocks.lookupCollection).not.toHaveBeenCalled()
  })

  it('fails fast for invalid idle TTL values', async () => {
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', 'abc')

    await expect(import('../../../../src/modules/icons/search')).rejects.toThrow(
      'ICON_SEARCH_INDEX_IDLE_TTL_MS 必须是整数',
    )
  })

  it('does not build the search index for exact icon searches', async () => {
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', '50')
    mocks.getIconSubset.mockResolvedValue({
      prefix: 'lucide',
      icons: {
        users: {},
      },
      aliases: {},
    })

    const { searchIcons } = await import('../../../../src/modules/icons/search')

    await searchIcons({ keyword: 'lucide:users', limit: 10 })
    await vi.advanceTimersByTimeAsync(100)

    expect(mocks.getIconSubset).toHaveBeenCalledWith('lucide', ['users'])
    expect(mocks.lookupCollection).not.toHaveBeenCalled()
  })

  it('builds custom keyword search on a custom-only index', async () => {
    const searchIndex =
      (await import('../../../../src/modules/icons/search/search-index')) as SearchIndexModule

    expect(searchIndex.mergeSearchItems).toBeUndefined()
    expect(searchIndex.buildCustomSearchIndex).toBeTypeOf('function')

    const builtinIndex = await searchIndex.getSearchIndex()
    const customIndex = searchIndex.buildCustomSearchIndex!([
      {
        prefix: 'acme',
        name: 'logo',
        collection: 'Acme Icons',
        palette: false,
      },
    ])

    expect(customIndex.all).toEqual([0])
    expect(customIndex.prefixes).toEqual(['acme'])
    expect(customIndex.names).toEqual(['logo'])
    expect(customIndex.collections).toEqual(['Acme Icons'])
    expect(customIndex.palettes).toEqual([false])
    expect(customIndex.recommended).toEqual([])
    expect(customIndex.all).not.toHaveLength(builtinIndex.all.length + 1)
  })
})
