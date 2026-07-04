import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  lookupCollection: vi.fn(),
  lookupCollections: vi.fn(),
}))

vi.mock('@iconify/json', () => ({
  lookupCollection: mocks.lookupCollection,
  lookupCollections: mocks.lookupCollections,
}))

describe('icon search index lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
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
    vi.useFakeTimers()
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', '50')
    const { getBuiltinSearchIndex } =
      await import('../../../../src/modules/icons/search/search-index')

    await getBuiltinSearchIndex()
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)

    mocks.lookupCollection.mockClear()
    await vi.advanceTimersByTimeAsync(51)

    await getBuiltinSearchIndex()
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)
  })

  it('refreshes the idle TTL when the existing search index is reused', async () => {
    vi.useFakeTimers()
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', '50')
    const { getBuiltinSearchIndex } =
      await import('../../../../src/modules/icons/search/search-index')

    await getBuiltinSearchIndex()
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)

    mocks.lookupCollection.mockClear()
    await vi.advanceTimersByTimeAsync(49)
    await getBuiltinSearchIndex()
    expect(mocks.lookupCollection).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(49)
    await getBuiltinSearchIndex()
    expect(mocks.lookupCollection).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(51)
    await getBuiltinSearchIndex()
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)
  })

  it('keeps the search index while idle cleanup is disabled', async () => {
    vi.useFakeTimers()
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', '0')
    const { getBuiltinSearchIndex } =
      await import('../../../../src/modules/icons/search/search-index')

    await getBuiltinSearchIndex()
    expect(mocks.lookupCollection).toHaveBeenCalledTimes(1)

    mocks.lookupCollection.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    await getBuiltinSearchIndex()

    expect(mocks.lookupCollection).not.toHaveBeenCalled()
  })

  it('fails fast for invalid idle TTL values', async () => {
    vi.stubEnv('ICON_SEARCH_INDEX_IDLE_TTL_MS', 'abc')

    await expect(import('../../../../src/modules/icons/search/search-index')).rejects.toThrow(
      'ICON_SEARCH_INDEX_IDLE_TTL_MS 必须是整数',
    )
  })
})
