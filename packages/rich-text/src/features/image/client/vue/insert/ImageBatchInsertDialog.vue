<script setup lang="ts">
import { NButton, NText, useThemeVars } from 'naive-ui'
import { computed, ref } from 'vue'
import type { RichTextImageAttrs } from '../../editor'
import ImagePickerDialog from '../shared/ImagePickerDialog.vue'
import ImagePropertiesPanel from '../shared/ImagePropertiesPanel.vue'
import { isValidSize, type ImageDraftState, type ImageUpload } from '../shared/draft'
import { maxImageCandidates, useImageBatchInsertSession } from './useImageBatchInsertSession'
import type { ListRichTextLibraryImages } from '../shared/useImageLibrary'

const props = defineProps<{
  upload: ImageUpload
  listLibraryImages?: ListRichTextLibraryImages
  pastedFiles?: File[] | undefined
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [images: RichTextImageAttrs[]]
  error: [error: unknown]
}>()

const {
  candidates,
  selected,
  selectedIndex,
  selectedSrcs,
  message,
  isUploading,
  localToUploadCount,
  canSubmit,
  addLocalFiles,
  toggleLibraryImage,
  select,
  moveSelected,
  remove,
  updateAlt,
  updateWidth,
  updateHeight,
  resetSize,
  retryRead,
  submit,
  dispose,
} = useImageBatchInsertSession({
  upload: props.upload,
  pastedFiles: props.pastedFiles,
  onError: (error) => emit('error', error),
})

const showLibrary = ref(false)
const themeVars = useThemeVars()

const confirmLabel = computed(() => {
  const count = candidates.value.length
  if (count === 0) {
    return '插入'
  }

  return localToUploadCount.value > 0 ? `上传并插入 ${count} 张` : `插入 ${count} 张`
})

const status = computed(() => {
  if (localToUploadCount.value > 0) {
    return `${localToUploadCount.value} 张本地图片待上传`
  }

  return candidates.value.length === 0 ? '尚未选择图片' : ''
})

function handleFiles(files: File[]) {
  if (addLocalFiles(files)) {
    showLibrary.value = false
  }
}

function handleSelect(image: ImageDraftState) {
  select(image)
  showLibrary.value = false
}

function hasInvalidSize(image: ImageDraftState) {
  return image.readState === 'ready' && (!isValidSize(image.width) || !isValidSize(image.height))
}

function getStatusLabel(image: ImageDraftState) {
  if (image.uploadState === 'uploading') {
    return '上传中'
  }

  if (hasInvalidSize(image)) {
    return '尺寸无效'
  }

  if (image.uploadState === 'error') {
    return '上传失败'
  }

  if (image.readState === 'error') {
    return '图片读取失败'
  }

  if (image.readState === 'loading') {
    return '图片读取中'
  }

  if (image.source === 'library') {
    return '图片库'
  }

  if (image.src !== null) {
    return '已上传'
  }

  return isUploading.value ? '等待上传' : '待上传'
}

function handleCancel() {
  dispose()
  emit('cancel')
}

async function handleConfirm() {
  const images = await submit()
  if (images !== null) {
    emit('confirm', images)
  }
}
</script>

<template>
  <ImagePickerDialog
    v-model:show-library="showLibrary"
    title="插入图片"
    source-label="添加图片"
    multiple
    :image="selected"
    :selected-srcs="selectedSrcs"
    :selection-limit="{ count: candidates.length, max: maxImageCandidates }"
    :list-library-images="listLibraryImages"
    :uploading="isUploading"
    :can-confirm="canSubmit"
    :confirm-label="confirmLabel"
    :message="message"
    :status="status"
    @select-files="handleFiles"
    @select-library-image="toggleLibraryImage"
    @cancel="handleCancel"
    @confirm="handleConfirm"
  >
    <template #sidebar>
      <div
        class="flex min-h-0 flex-col gap-2 border-r border-(--rich-text-theme-input-divider-color) p-2"
        :style="{ backgroundColor: themeVars.actionColor }"
      >
        <NText depth="3" class="shrink-0 px-2 pt-1 text-xs">已选图片</NText>
        <div
          data-test="rich-text-image-candidate-list"
          role="listbox"
          aria-label="已选图片"
          class="grid min-h-0 flex-1 auto-rows-max gap-1 overflow-y-auto"
        >
          <NButton
            v-for="candidate in candidates"
            :key="candidate.id"
            data-test="rich-text-image-candidate"
            role="option"
            block
            :aria-selected="candidate === selected"
            :title="candidate.name"
            :disabled="isUploading"
            class="image-candidate-button min-w-0"
            style="height: auto; padding: 8px"
            :type="candidate === selected ? 'primary' : 'default'"
            :secondary="candidate === selected"
            :quaternary="candidate !== selected"
            @click="handleSelect(candidate)"
          >
            <span
              class="grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2 text-left"
            >
              <img
                :src="candidate.previewSrc"
                alt=""
                class="size-9 rounded-(--rich-text-theme-border-radius) object-cover"
              />
              <span class="flex min-w-0 flex-col gap-1">
                <span class="truncate text-xs">{{ candidate.name }}</span>
                <span
                  class="text-xs"
                  :class="
                    candidate.uploadState === 'error' ||
                    candidate.readState === 'error' ||
                    hasInvalidSize(candidate)
                      ? 'text-(--rich-text-theme-error-color)'
                      : 'text-(--rich-text-theme-muted-text-color)'
                  "
                  >{{ getStatusLabel(candidate) }}</span
                >
              </span>
            </span>
          </NButton>
        </div>
      </div>
    </template>
    <template #default="{ openFileDialog }">
      <div v-if="selected === null" class="flex min-h-0 min-w-0 items-center justify-center p-5">
        <NButton
          data-test="rich-text-image-file"
          data-rich-text-image-focus
          block
          dashed
          class="max-w-sm"
          aria-label="点击选择或拖入图片"
          style="height: 180px"
          :disabled="isUploading"
          @click="openFileDialog()"
        >
          <span class="flex flex-col items-center gap-3 py-6 whitespace-normal">
            <span class="i-[lucide--image-plus] size-8" aria-hidden="true" />
            <span>点击选择或拖入图片</span>
            <NText depth="3" class="text-xs"
              >一次最多选择 {{ maxImageCandidates }} 张图片，支持粘贴</NText
            >
          </span>
        </NButton>
      </div>
      <div v-else class="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-5">
        <div class="flex h-7 shrink-0 items-center justify-between gap-2">
          <NText class="min-w-0 truncate text-sm" :title="selected.name">
            {{ selected.name }}
          </NText>
          <div class="flex shrink-0 gap-1">
            <NButton
              v-if="candidates.length > 1"
              data-test="rich-text-image-move-up"
              size="small"
              quaternary
              style="--n-padding: 0 6px"
              title="前移图片"
              aria-label="前移图片"
              :disabled="isUploading || selectedIndex === 0"
              @click="moveSelected(-1)"
            >
              <span class="i-[lucide--arrow-up]" aria-hidden="true" />
            </NButton>
            <NButton
              v-if="candidates.length > 1"
              data-test="rich-text-image-move-down"
              size="small"
              quaternary
              style="--n-padding: 0 6px"
              title="后移图片"
              aria-label="后移图片"
              :disabled="isUploading || selectedIndex === candidates.length - 1"
              @click="moveSelected(1)"
            >
              <span class="i-[lucide--arrow-down]" aria-hidden="true" />
            </NButton>
            <NButton
              data-test="rich-text-image-remove"
              size="small"
              quaternary
              style="--n-padding: 0 6px"
              title="移除图片"
              aria-label="移除图片"
              :disabled="isUploading"
              @click="remove(selected)"
            >
              <span class="i-[lucide--trash-2]" aria-hidden="true" />
            </NButton>
          </div>
        </div>
        <ImagePropertiesPanel
          :image="selected"
          :disabled="isUploading"
          @update-alt="updateAlt"
          @update-width="updateWidth"
          @update-height="updateHeight"
          @reset-size="resetSize"
          @retry-read="retryRead"
        />
      </div>
    </template>
  </ImagePickerDialog>
</template>

<style scoped>
.image-candidate-button :deep(.n-button__content) {
  width: 100%;
}
</style>
