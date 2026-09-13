import type { EntryKey, QueryCache, UseQueryEntryFilter } from '@pinia/colada'

function resetInfiniteEntries(queryCache: QueryCache, filters: UseQueryEntryFilter) {
  for (const entry of queryCache.getEntries(filters)) {
    queryCache.cancel(entry)
    queryCache.setEntryState(entry, {
      status: 'pending',
      data: undefined,
      error: null,
    })
    queryCache.invalidate(entry)
  }
}

export async function resetInfiniteQuery(queryCache: QueryCache, key: EntryKey) {
  const entry = queryCache.get(key)

  if (entry === undefined) return

  resetInfiniteEntries(queryCache, { key, exact: true })
  await Promise.allSettled([queryCache.invalidateQueries({ key, exact: true })])
}

export async function refreshCustomIconCaches(queryCache: QueryCache) {
  const iconListFilter = {
    key: ['content', 'icon-sets', 'custom', 'icons'],
  } satisfies UseQueryEntryFilter

  resetInfiniteEntries(queryCache, iconListFilter)

  await Promise.allSettled([
    queryCache.invalidateQueries(iconListFilter),
    queryCache.invalidateQueries({ key: ['content', 'icon-sets', 'custom', 'sets'] }),
    queryCache.invalidateQueries({ key: ['system', 'icons', 'search'] }),
  ])
}
