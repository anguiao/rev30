import { watch, type Ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'

export function useHealthQuery<T>(
  name: string,
  query: () => Promise<T>,
  enabled: Ref<boolean>,
  intervalMs: number,
) {
  const queryCache = useQueryCache()

  const key = ['ops', 'system-health', name]

  const getQueryEntry = () => queryCache.getEntries({ key, exact: true })[0]

  const options = {
    key,
    query,
    enabled,
    // Always refresh settled data; refresh() reuses pending requests.
    staleTime: 0,
    // The shared entry can still be loading a request started by a previous page.
    autoRefetch: () => (getQueryEntry()?.pending ? false : intervalMs),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }

  const result = useQuery(options)

  // Auto-refetch 0.2 does not reschedule failed requests. Restore current options
  // even while disabled, so an old page cannot resume polling.
  watch([result.error, result.asyncStatus], ([error, status], _, onCleanup) => {
    if (error === null || status !== 'idle') {
      return
    }

    const entry = getQueryEntry()
    if (!entry?.active) {
      return
    }

    queryCache.ensure(options)

    // Colada may reapply an old page's options later in the promise chain.
    const restoreTimeout = setTimeout(() => {
      if (entry.active && !entry.pending && entry.options?.enabled !== enabled) {
        queryCache.ensure(options)
      }
    }, 0)

    onCleanup(() => clearTimeout(restoreTimeout))
  })

  return result
}
