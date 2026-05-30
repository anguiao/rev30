<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAvatar } from 'naive-ui'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import { useAttachmentUrl } from '../attachments'

const props = withDefaults(
  defineProps<{
    avatarId: string | null
    nickname?: string | null
    username?: string | null
    size?: number | 'small' | 'medium' | 'large'
  }>(),
  {
    nickname: null,
    username: null,
    size: 'medium',
  },
)

const imageFailed = ref(false)
const signed = useAttachmentUrl(() => props.avatarId, {
  disposition: ATTACHMENT_DISPOSITION_INLINE,
})

const displayName = computed(() => props.nickname || props.username || '?')
const initial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || '?')
const imageUrl = computed(() => {
  if (imageFailed.value || signed.error.value !== null) return null

  return signed.url.value
})

watch(
  () => props.avatarId,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <NAvatar
    round
    :size="size"
    :src="imageUrl ?? undefined"
    class="bg-primary-muted! text-primary!"
    @error="imageFailed = true"
  >
    <span v-if="imageUrl === null">{{ initial }}</span>
  </NAvatar>
</template>
