import { ATTACHMENT_DISPOSITION_ATTACHMENT, type AttachmentDisposition } from '@rev30/contracts'
import { computed, onScopeDispose, readonly, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { createAttachmentSignedUrl } from './requests'

const signedUrlRefreshLeadMs = 30_000

type UseAttachmentUrlOptions = {
  disposition?: MaybeRefOrGetter<AttachmentDisposition | undefined>
  enabled?: MaybeRefOrGetter<boolean | undefined>
}

export function useAttachmentUrl(
  id: MaybeRefOrGetter<string | null | undefined>,
  options: UseAttachmentUrlOptions = {},
) {
  const url = ref<string | null>(null)
  const expiresAt = ref<string | null>(null)
  const error = ref<unknown>(null)
  const isLoading = ref(false)
  const activeDisposition = computed(
    () => toValue(options.disposition) ?? ATTACHMENT_DISPOSITION_ATTACHMENT,
  )
  const isEnabled = computed(() => toValue(options.enabled) ?? true)
  let requestVersion = 0
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function scheduleRefresh(nextExpiresAt: string, version: number) {
    clearRefreshTimer()

    const expiresTime = Date.parse(nextExpiresAt)
    const remainingMs = expiresTime - Date.now()
    const delay =
      remainingMs > signedUrlRefreshLeadMs
        ? remainingMs - signedUrlRefreshLeadMs
        : Math.floor(remainingMs / 2)

    if (!Number.isFinite(expiresTime) || delay <= 0) return

    refreshTimer = setTimeout(() => {
      if (version === requestVersion) void refresh()
    }, delay)
  }

  function invalidateAndClear() {
    requestVersion += 1
    clearRefreshTimer()
    url.value = null
    expiresAt.value = null
    error.value = null
    isLoading.value = false
  }

  async function refresh() {
    const attachmentId = toValue(id)

    if (!attachmentId || !isEnabled.value) {
      invalidateAndClear()
      return
    }

    const currentRequestVersion = ++requestVersion
    clearRefreshTimer()
    url.value = null
    expiresAt.value = null
    isLoading.value = true
    error.value = null

    try {
      const signed = await createAttachmentSignedUrl(attachmentId, {
        disposition: activeDisposition.value,
      })

      if (currentRequestVersion !== requestVersion) return

      url.value = signed.url
      expiresAt.value = signed.expiresAt
      scheduleRefresh(signed.expiresAt, currentRequestVersion)
    } catch (caught) {
      if (currentRequestVersion !== requestVersion) return

      url.value = null
      expiresAt.value = null
      error.value = caught
    } finally {
      if (currentRequestVersion === requestVersion) isLoading.value = false
    }
  }

  watch(
    [() => toValue(id), isEnabled, activeDisposition],
    () => {
      void refresh()
    },
    {
      immediate: true,
    },
  )

  onScopeDispose(() => {
    requestVersion += 1
    clearRefreshTimer()
  })

  return {
    error: readonly(error),
    expiresAt: readonly(expiresAt),
    isLoading: readonly(isLoading),
    refresh,
    url: readonly(url),
  }
}
