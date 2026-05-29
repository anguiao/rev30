import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  type AttachmentDisposition,
} from '@rev30/contracts'
import { computed, readonly, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { createAttachmentSignedUrl } from './requests'

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

  async function refresh() {
    const attachmentId = toValue(id)

    if (!attachmentId || !isEnabled.value) {
      url.value = null
      expiresAt.value = null
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const signed = await createAttachmentSignedUrl(attachmentId, {
        disposition: activeDisposition.value,
      })

      url.value = signed.url
      expiresAt.value = signed.expiresAt
    } catch (caught) {
      url.value = null
      expiresAt.value = null
      error.value = caught
    } finally {
      isLoading.value = false
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

  return {
    error: readonly(error),
    expiresAt: readonly(expiresAt),
    isLoading: readonly(isLoading),
    refresh,
    url: readonly(url),
  }
}
