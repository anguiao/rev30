<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NUpload, type UploadCustomRequestOptions } from 'naive-ui'
import { ATTACHMENT_DISPOSITION_INLINE, ATTACHMENT_USAGE_AVATAR } from '@rev30/contracts'
import { uploadAttachment, useAttachmentUrl } from '../attachments'

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
const signed = useAttachmentUrl(() => props.avatarId, {
  disposition: ATTACHMENT_DISPOSITION_INLINE,
})
const imageUrl = computed(() => {
  if (props.avatarId === null || imageFailed.value || signed.error.value !== null) {
    return null
  }

  return signed.url.value
})
const hasImage = computed(() => imageUrl.value !== null)

async function uploadFile(file: File) {
  isUploading.value = true

  try {
    const attachment = await uploadAttachment(file, { usage: ATTACHMENT_USAGE_AVATAR })
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
    :max="1"
    :show-file-list="false"
  >
    <button
      type="button"
      class="group relative inline-flex items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-primary transition hover:border-primary dark:border-zinc-700 dark:bg-zinc-900"
      :style="{ width: `${size}px`, height: `${size}px` }"
      :aria-label="label"
      :title="label"
    >
      <img
        v-if="hasImage"
        :src="imageUrl!"
        alt=""
        class="size-full rounded-full object-cover"
        @error="imageFailed = true"
      />
      <span v-else class="i-[lucide--plus] size-5" aria-hidden="true" />
      <span
        v-if="hasImage"
        class="absolute inset-0 hidden items-center justify-center rounded-full bg-stone-950/35 text-white group-hover:flex"
        aria-hidden="true"
      >
        <span class="i-[lucide--plus] size-5" />
      </span>
    </button>
  </NUpload>
</template>
