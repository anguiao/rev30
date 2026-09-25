<script setup lang="ts">
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  type AttachmentListItem,
} from '@rev30/contracts'
import { NButton, NImage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { getAttachmentContentUrl } from './requests'
import { useSignedAttachmentUrl } from './useSignedAttachmentUrl'

const props = defineProps<{
  attachment: AttachmentListItem
}>()

const imageFailed = ref(false)
const isImage = computed(() => props.attachment.mimeType.startsWith('image/'))
const signedImage = useSignedAttachmentUrl(() => props.attachment.id, {
  disposition: ATTACHMENT_DISPOSITION_INLINE,
  enabled: computed(
    () => isImage.value && props.attachment.readPolicy !== ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ),
})
const previewUrl = computed(() => {
  if (!isImage.value || imageFailed.value) return null
  if (props.attachment.readPolicy === ATTACHMENT_READ_POLICY_AUTHENTICATED) {
    return getAttachmentContentUrl(props.attachment.id)
  }
  if (signedImage.error.value !== null) return null

  return signedImage.url.value
})
const iconClass = computed(() =>
  isImage.value ? 'i-[lucide--image] text-stone-500 dark:text-zinc-400' : 'i-[lucide--file]',
)

const hasPreviewError = computed(
  () => isImage.value && (imageFailed.value || signedImage.error.value !== null),
)

async function retryPreview() {
  if (props.attachment.readPolicy !== ATTACHMENT_READ_POLICY_AUTHENTICATED) {
    await signedImage.refresh()
  }
  imageFailed.value = false
}

useEventListener('online', () => {
  if (imageFailed.value && !signedImage.isLoading.value) void retryPreview()
})

watch(
  () => [props.attachment.id, signedImage.url.value],
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <NImage
    v-if="previewUrl !== null"
    :src="previewUrl"
    :preview-src="previewUrl"
    :alt="attachment.originalName"
    :width="40"
    :height="40"
    object-fit="cover"
    show-toolbar-tooltip
    class="block size-10 overflow-hidden rounded border border-stone-200 dark:border-zinc-700"
    @error="imageFailed = true"
  />
  <span v-else class="inline-flex items-center gap-2">
    <span
      data-test="attachments-preview-icon"
      :class="['inline-block size-5', iconClass]"
      aria-hidden="true"
    />
    <NButton
      v-if="hasPreviewError"
      text
      size="tiny"
      aria-label="重试预览"
      :loading="signedImage.isLoading.value"
      @click="retryPreview"
    >
      重试
    </NButton>
  </span>
</template>
