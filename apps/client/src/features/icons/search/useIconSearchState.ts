import type { AsyncStatus } from '@pinia/colada'
import { iconErrorCodeSchema } from '@rev30/contracts'
import type { ComputedRef, Ref } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'
import { computed, watch } from 'vue'
import { ApiRequestError } from '../../../utils/request'

export function useIconSearchState(options: {
  error: Ref<Error | null>
  asyncStatus: Ref<AsyncStatus>
  enabled: ComputedRef<boolean>
  refetch: () => Promise<unknown>
}) {
  const errorCode = computed(() => {
    const error = options.error.value
    return error instanceof ApiRequestError ? error.code : undefined
  })
  const isPreparing = computed(
    () => errorCode.value === iconErrorCodeSchema.enum.ICON_SEARCH_PREPARING,
  )
  const isUnavailable = computed(
    () => errorCode.value === iconErrorCodeSchema.enum.ICON_SEARCH_UNAVAILABLE,
  )
  const visibility = useDocumentVisibility()
  let retryAttempt = 0

  function retry() {
    retryAttempt = 0
    return options.refetch()
  }

  watch(
    [options.enabled, options.asyncStatus, isPreparing, visibility],
    ([enabled, asyncStatus, preparing, visible], _, onCleanup) => {
      if (!enabled || !preparing) {
        retryAttempt = 0
        return
      }
      if (asyncStatus !== 'idle' || visible !== 'visible') return

      const delay = 1_000 * 2 ** Math.min(retryAttempt, 3) * (0.8 + Math.random() * 0.2)
      const timeout = window.setTimeout(() => {
        retryAttempt += 1
        void options.refetch()
      }, delay)
      onCleanup(() => window.clearTimeout(timeout))
    },
    { immediate: true },
  )

  return {
    retry,
    isPreparing,
    isUnavailable,
    isOrdinaryError: computed(
      () => options.error.value !== null && !isPreparing.value && !isUnavailable.value,
    ),
  }
}
