<script setup lang="ts">
import { ATTACHMENT_READ_POLICY_AUTHENTICATED } from '@rev30/contracts'
import { computed, ref, watch } from 'vue'
import { NUpload, type UploadCustomRequestOptions } from 'naive-ui'
import { getAttachmentContentUrl, uploadAttachment } from '../attachments'

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
    size: 80,
  },
)

const emit = defineEmits<{
  uploaded: [avatarId: string]
  error: [error: unknown]
}>()

const imageFailed = ref(false)
const isUploading = ref(false)
const label = computed(() => (props.avatarId === null ? '上传头像' : '更换头像'))
const imageUrl = computed(() => {
  if (props.avatarId === null || imageFailed.value) return null

  return getAttachmentContentUrl(props.avatarId)
})
const hasImage = computed(() => imageUrl.value !== null)
const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}))
const plusIconStyle = computed(() => {
  const iconSize = Math.max(20, Math.round(props.size * 0.25))

  return {
    width: `${iconSize}px`,
    height: `${iconSize}px`,
  }
})

async function uploadFile(file: File) {
  isUploading.value = true

  try {
    const attachment = await uploadAttachment(file, {
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })
    emit('uploaded', attachment.id)
  } catch (error) {
    emit('error', error)
    throw error
  } finally {
    isUploading.value = false
  }
}

function customRequest({ file, onFinish, onError }: UploadCustomRequestOptions) {
  const rawFile = file.file

  if (!(rawFile instanceof File)) {
    const error = new Error('请选择文件')
    emit('error', error)
    onError()
    return
  }

  uploadFile(rawFile).then(onFinish, () => onError())
}

defineExpose({ uploadFile })

watch(
  () => props.avatarId,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <NUpload
    accept="image/*"
    :custom-request="customRequest"
    :default-upload="true"
    :disabled="isUploading"
    :show-file-list="false"
  >
    <button
      type="button"
      class="group relative inline-flex items-center justify-center rounded-full border-2 border-stone-200 bg-stone-50 text-primary transition hover:border-primary-hover focus-visible:border-primary-hover focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-900"
      :style="avatarStyle"
      :aria-label="label"
      :disabled="isUploading"
      :aria-busy="isUploading"
      :title="label"
    >
      <img
        v-if="hasImage"
        :src="imageUrl!"
        alt=""
        class="size-full rounded-full object-cover"
        @error="imageFailed = true"
      />
      <span
        v-else
        class="i-[lucide--plus] inline-block"
        :style="plusIconStyle"
        aria-hidden="true"
      />
      <span
        v-if="hasImage"
        class="absolute inset-0 hidden items-center justify-center rounded-full bg-white/45 text-primary-hover group-hover:flex dark:bg-zinc-900/35 dark:text-white"
        aria-hidden="true"
      >
        <span class="i-[lucide--plus] inline-block" :style="plusIconStyle" />
      </span>
    </button>
  </NUpload>
</template>
