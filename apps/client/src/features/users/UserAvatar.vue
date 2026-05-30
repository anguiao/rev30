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

const displayName = computed(() => {
  const trimmedNickname = (props.nickname ?? '').trim()
  if (trimmedNickname !== '') {
    return trimmedNickname
  }

  const trimmedUsername = (props.username ?? '').trim()
  if (trimmedUsername !== '') {
    return trimmedUsername
  }

  return '?'
})
const initial = computed(() => displayName.value.charAt(0).toUpperCase())
const imageUrl = computed(() => {
  if (imageFailed.value || signed.error.value !== null) return null

  return signed.url.value
})

const avatarProps = computed(() =>
  imageUrl.value === null
    ? {}
    : {
        src: imageUrl.value,
      },
)

watch(
  () => props.avatarId,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <NAvatar
    v-bind="avatarProps"
    round
    :size="size"
    class="bg-primary-muted! text-primary!"
    @error="imageFailed = true"
  >
    <span v-if="imageUrl === null">{{ initial }}</span>
  </NAvatar>
</template>
