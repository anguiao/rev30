<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import { useAttachmentUrl } from '../attachments'

const props = withDefaults(
  defineProps<{
    avatarId: string | null
    nickname?: string | null
    username?: string | null
    size?: number
  }>(),
  {
    nickname: null,
    username: null,
    size: 34,
  },
)

const imageFailed = ref(false)
const signed = useAttachmentUrl(() => props.avatarId, {
  disposition: ATTACHMENT_DISPOSITION_INLINE,
})

const displayName = computed(() => {
  return props.nickname?.trim() || props.username?.trim() || '?'
})
const initial = computed(() => displayName.value.charAt(0).toUpperCase())
const imageUrl = computed(() => {
  if (imageFailed.value || signed.error.value !== null) return null

  return signed.url.value
})
const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.max(12, Math.round(props.size * 0.45))}px`,
}))

watch(
  () => props.avatarId,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-muted leading-none font-medium text-primary"
    :style="avatarStyle"
    :aria-label="displayName"
  >
    <img
      v-if="imageUrl !== null"
      :src="imageUrl"
      alt=""
      class="size-full object-cover"
      @error="imageFailed = true"
    />
    <span v-else>{{ initial }}</span>
  </span>
</template>
