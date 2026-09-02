import { watch, type Ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'

export function useHealthQuery<T>(
  name: string,
  query: () => Promise<T>,
  visible: Ref<boolean>,
  interval: number,
) {
  const cache = useQueryCache()
  const key = ['ops', 'system-health', name]
  const getEntry = () => cache.getEntries({ key, exact: true })[0]
  const options = {
    key,
    query,
    enabled: visible,
    staleTime: 0,
    // The shared entry can still be loading a request started by a previous page.
    autoRefetch: () => (getEntry()?.pending ? false : interval),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
  const result = useQuery(options)

  // Auto-refetch 0.2 resumes after successful fetches only. Observe settled
  // failures, including requests inherited from a previous page.
  watch([result.error, result.asyncStatus, visible], ([error, status, isVisible], _, onCleanup) => {
    if (error === null || status !== 'idle' || !isVisible) return
    const entry = getEntry()
    if (!entry?.active) return
    cache.ensure(options)

    // An old refresh error handler can restore its disposed page's options later
    // in this microtask chain. Restore current options only if that happened.
    const timeout = setTimeout(() => {
      if (visible.value && entry.active && !entry.pending && entry.options?.enabled !== visible) {
        cache.ensure(options)
      }
    }, 0)
    onCleanup(() => clearTimeout(timeout))
  })
  return result
}
