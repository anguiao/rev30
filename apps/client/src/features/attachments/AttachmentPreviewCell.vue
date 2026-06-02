<script setup lang="ts">
import { ATTACHMENT_DISPOSITION_INLINE, type AttachmentListItem } from '@rev30/contracts'
import { NImage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useSignedAttachmentUrl } from './useSignedAttachmentUrl'

const props = defineProps<{
  attachment: AttachmentListItem
}>()

const imageFailed = ref(false)
const isImage = computed(() => props.attachment.mimeType.startsWith('image/'))
const image = useSignedAttachmentUrl(() => props.attachment.id, {
  disposition: ATTACHMENT_DISPOSITION_INLINE,
  enabled: isImage,
})
const previewUrl = computed(() => {
  if (!isImage.value || imageFailed.value || image.error.value !== null) return null

  return image.url.value
})
const iconClass = computed(() =>
  isImage.value ? 'i-[lucide--image] text-stone-500 dark:text-zinc-400' : 'i-[lucide--file]',
)

watch(
  () => props.attachment.id,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <NImage
    v-if="previewUrl !== null"
    data-test="attachments-preview-image"
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
  <span
    v-else
    data-test="attachments-preview-icon"
    :class="['inline-block size-5', iconClass]"
    aria-hidden="true"
  />
</template>
