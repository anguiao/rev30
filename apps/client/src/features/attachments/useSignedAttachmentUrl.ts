import { ATTACHMENT_DISPOSITION_ATTACHMENT, type AttachmentDisposition } from '@rev30/contracts'
import { millisecondsUntil } from '@rev30/utils'
import { useQuery } from '@pinia/colada'
import { useTimeoutFn } from '@vueuse/core'
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { resolveSignedAttachmentUrl } from './requests'

const contentUrlRefreshLeadMs = 30_000

type UseSignedAttachmentUrlOptions = {
  disposition?: MaybeRefOrGetter<AttachmentDisposition | undefined>
  enabled?: MaybeRefOrGetter<boolean | undefined>
}

export function useSignedAttachmentUrl(
  id: MaybeRefOrGetter<string | null | undefined>,
  options: UseSignedAttachmentUrlOptions = {},
) {
  const attachmentId = computed(() => toValue(id) || null)
  const disposition = computed(
    () => toValue(options.disposition) ?? ATTACHMENT_DISPOSITION_ATTACHMENT,
  )
  const isEnabled = computed(
    () => attachmentId.value !== null && (toValue(options.enabled) ?? true),
  )

  const {
    data,
    error: rawError,
    isLoading: rawLoading,
    refetch,
  } = useQuery({
    key: () => ['attachments', 'content-url', attachmentId.value, disposition.value],
    enabled: isEnabled,
    staleTime: 30_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    query: () =>
      resolveSignedAttachmentUrl(attachmentId.value!, {
        disposition: disposition.value,
      }),
  })

  const contentUrl = computed(() => {
    if (!isEnabled.value || rawLoading.value || rawError.value !== null) return null

    return data.value ?? null
  })
  const expiresAt = computed(() => contentUrl.value?.expiresAt ?? null)
  const url = computed(() => contentUrl.value?.url ?? null)
  const error = computed(() => (isEnabled.value ? rawError.value : null))
  const isLoading = computed(() => isEnabled.value && rawLoading.value)

  const refreshDelay = ref(0)
  const refreshTimer = useTimeoutFn(
    () => {
      if (isEnabled.value) void refetch()
    },
    refreshDelay,
    { immediate: false },
  )

  watch(
    expiresAt,
    (nextExpiresAt) => {
      refreshTimer.stop()

      if (!nextExpiresAt) return

      const delay = millisecondsUntil(nextExpiresAt) - contentUrlRefreshLeadMs

      if (delay <= 0) return

      refreshDelay.value = delay
      refreshTimer.start()
    },
    { immediate: true },
  )

  async function refresh() {
    refreshTimer.stop()

    if (!isEnabled.value) return

    await refetch()
  }

  return {
    url,
    expiresAt,
    error,
    isLoading,
    refresh,
  }
}
