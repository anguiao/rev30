import { iconErrorCodeSchema } from '@rev30/contracts'
import { useDocumentVisibility } from '@vueuse/core'
import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { ApiRequestError } from '../../../utils/request'

export function useIconSearchRetry(options: {
  error: MaybeRefOrGetter<Error | null>
  isLoading: MaybeRefOrGetter<boolean>
  enabled: MaybeRefOrGetter<boolean>
  refetch: () => Promise<unknown>
}) {
  const isPreparing = computed(() => {
    const error = toValue(options.error)
    return (
      error instanceof ApiRequestError &&
      error.code === iconErrorCodeSchema.enum.ICON_SEARCH_PREPARING
    )
  })
  const visibility = useDocumentVisibility()
  let retryAttempt = 0

  function retry() {
    retryAttempt = 0
    return options.refetch()
  }

  watch(
    [() => toValue(options.enabled), () => toValue(options.isLoading), isPreparing, visibility],
    ([enabled, isLoading, preparing, visible], _, onCleanup) => {
      if (!enabled || !preparing) {
        retryAttempt = 0
        return
      }
      if (isLoading || visible !== 'visible') return

      const delay = 1_000 * 2 ** Math.min(retryAttempt, 3) * (0.8 + Math.random() * 0.2)
      const timeout = window.setTimeout(() => {
        retryAttempt += 1
        void options.refetch()
      }, delay)

      onCleanup(() => window.clearTimeout(timeout))
    },
    { immediate: true },
  )

  return { retry }
}
