import { onScopeDispose, type Ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'

export function useHealthQuery<T>(
  name: string,
  query: () => Promise<T>,
  visible: Ref<boolean>,
  interval: number,
) {
  const cache = useQueryCache()
  const key = ['ops', 'system-health', name]
  let inFlight = false
  const result = useQuery({
    key,
    query: async () => {
      inFlight = true
      try {
        return await query()
      } finally {
        inFlight = false
      }
    },
    enabled: visible,
    staleTime: 0,
    autoRefetch: () => (inFlight ? false : interval),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Auto-refetch 0.2 resumes after successful fetches only. Re-ensure failed
  // health entries through the public API so its timer also retries failures.
  const unsubscribe = cache.$onAction(({ name: action, args, onError }) => {
    if (action !== 'fetch') return
    const [entry] = args
    if (entry.key.length !== key.length || entry.key.some((part, index) => part !== key[index]))
      return
    onError(() => {
      if (visible.value && entry.active && entry.options) cache.ensure(entry.options)
    })
  })
  onScopeDispose(unsubscribe)
  return result
}
