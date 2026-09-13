import type { AsyncStatus } from '@pinia/colada'
import type { ComputedRef, Ref } from 'vue'
import { computed, watch } from 'vue'
import { ApiRequestError } from '../../utils/request'

export function getIconSearchErrorCode(error: unknown) {
  return error instanceof ApiRequestError ? error.code : undefined
}

export function useIconSearchState(options: {
  error: Ref<Error | null>
  asyncStatus: Ref<AsyncStatus>
  enabled: ComputedRef<boolean>
  refetch: () => Promise<unknown>
}) {
  const errorCode = computed(() => getIconSearchErrorCode(options.error.value))
  const isPreparing = computed(() => errorCode.value === 'ICON_SEARCH_PREPARING')
  const isUnavailable = computed(() => errorCode.value === 'ICON_SEARCH_UNAVAILABLE')

  watch(
    [options.enabled, options.asyncStatus, isPreparing],
    ([enabled, asyncStatus, preparing], _, onCleanup) => {
      if (!enabled || asyncStatus !== 'idle' || !preparing) return

      const timeout = window.setTimeout(() => void options.refetch(), 1_000)
      onCleanup(() => window.clearTimeout(timeout))
    },
    { immediate: true },
  )

  return {
    isPreparing,
    isUnavailable,
    isOrdinaryError: computed(
      () => options.error.value !== null && !isPreparing.value && !isUnavailable.value,
    ),
  }
}
