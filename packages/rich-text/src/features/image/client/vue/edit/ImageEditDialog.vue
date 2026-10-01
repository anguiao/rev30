<script setup lang="ts">
import { NText } from 'naive-ui'
import { computed, ref } from 'vue'
import type { RichTextImageAttrs } from '../../editor'
import ImagePickerDialog from '../shared/ImagePickerDialog.vue'
import ImagePropertiesPanel from '../shared/ImagePropertiesPanel.vue'
import type { ImageUpload } from '../shared/draft'
import { useImageEditSession } from './useImageEditSession'
import type { ImageLibraryItem, ListRichTextLibraryImages } from '../shared/useImageLibrary'

const props = defineProps<{
  upload: ImageUpload
  existingImage: RichTextImageAttrs
  listLibraryImages?: ListRichTextLibraryImages
  pastedFiles?: File[] | undefined
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [image: RichTextImageAttrs]
  error: [error: unknown]
}>()

const {
  image,
  needsUpload,
  message,
  isUploading,
  canSubmit,
  replaceLocalFiles,
  replaceLibraryImage,
  updateAlt,
  updateWidth,
  updateHeight,
  resetSize,
  retryRead,
  submit,
  dispose,
} = useImageEditSession({
  upload: props.upload,
  existingImage: props.existingImage,
  pastedFiles: props.pastedFiles,
  onError: (error) => emit('error', error),
})

const showLibrary = ref(false)
const selectedSrcs = computed(() => (image.value.src === null ? [] : [image.value.src]))

function handleFiles(files: File[]) {
  if (replaceLocalFiles(files)) {
    showLibrary.value = false
  }
}

function handleLibrarySelect(item: ImageLibraryItem) {
  if (replaceLibraryImage(item)) {
    showLibrary.value = false
  }
}

function handleCancel() {
  dispose()
  emit('cancel')
}

async function handleConfirm() {
  const attrs = await submit()
  if (attrs !== null) {
    emit('confirm', attrs)
  }
}
</script>

<template>
  <ImagePickerDialog
    v-model:show-library="showLibrary"
    title="编辑图片"
    source-label="替换图片"
    :multiple="false"
    :image="image"
    :selected-srcs="selectedSrcs"
    :list-library-images="listLibraryImages"
    :uploading="isUploading"
    :can-confirm="canSubmit"
    :confirm-label="needsUpload ? '上传并应用' : '应用'"
    :message="message"
    :status="needsUpload ? '1 张本地图片待上传' : ''"
    @select-files="handleFiles"
    @select-library-image="handleLibrarySelect"
    @cancel="handleCancel"
    @confirm="handleConfirm"
  >
    <div class="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-5">
      <div class="flex h-7 shrink-0 items-center">
        <NText class="min-w-0 truncate text-sm" :title="image.name">{{ image.name }}</NText>
      </div>
      <ImagePropertiesPanel
        :image="image"
        :disabled="isUploading"
        @update-alt="updateAlt"
        @update-width="updateWidth"
        @update-height="updateHeight"
        @reset-size="resetSize"
        @retry-read="retryRead"
      />
    </div>
  </ImagePickerDialog>
</template>
