<script setup lang="ts">
import type { RichTextImageAttrs } from '../shared'
import { NButton, NFormItem, NImage, NInput, NInputNumber, NModal, NSpin } from 'naive-ui'
import { useDropZone, useEventListener, useFileDialog, useObjectUrl } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    upload: (file: File) => Promise<{ src: string }>
    existingAttrs?: RichTextImageAttrs | undefined
  }>(),
  {},
)

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [attrs: RichTextImageAttrs]
  error: [error: unknown]
}>()

const isExistingImage = computed(() => props.existingAttrs !== undefined)

const selectedFile = ref<File | null>(null)
const hasSelectedFile = computed(() => selectedFile.value !== null)
const localPreviewSrc = useObjectUrl(selectedFile)

const activeUpload = shallowRef<Promise<{ src: string }> | null>(null)
const isUploading = computed(() => activeUpload.value !== null)
const canSelectFile = computed(() => props.show && !isExistingImage.value && !isUploading.value)

function selectLocalImageFile(file: File) {
  selectedFile.value = file
  resetImageState()
}

const {
  open: openFileDialog,
  reset: resetFileDialog,
  onChange: onFileDialogChange,
} = useFileDialog({
  accept: 'image/*',
  multiple: false,
  reset: true,
})
onFileDialogChange((files) => {
  const file = files?.item(0)
  if (file === null || file === undefined) {
    return
  }

  selectLocalImageFile(file)
})

const dropZoneRef = ref<HTMLElement | null>(null)
const { isOverDropZone } = useDropZone(dropZoneRef, {
  multiple: false,
  preventDefaultForUnhandled: true,
  checkValidity: () => canSelectFile.value,
  onDrop(files) {
    const file = files?.[0]
    if (file === undefined) {
      return
    }
    if (!file.type.startsWith('image/')) {
      return
    }

    selectLocalImageFile(file)
  },
})

useEventListener(window, 'paste', (event) => {
  const target = event.target
  if (
    !canSelectFile.value ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return
  }

  const file = event.clipboardData?.files?.item(0)
  if (file === null || file === undefined) {
    return
  }
  if (!file.type.startsWith('image/')) {
    return
  }

  event.preventDefault()
  selectLocalImageFile(file)
})

const src = ref('')
const alt = ref('')
const width = ref<number | null>(null)
const height = ref<number | null>(null)
const naturalWidth = ref<number | null>(null)
const naturalHeight = ref<number | null>(null)
const aspectRatio = computed(() =>
  naturalWidth.value === null || naturalHeight.value === null
    ? null
    : naturalWidth.value / naturalHeight.value,
)

const isImageReady = computed(
  () => src.value !== '' && naturalWidth.value !== null && naturalHeight.value !== null,
)

const displayPreviewSrc = computed(() => src.value || localPreviewSrc.value || '')
const selectButtonLabel = computed(() => (hasSelectedFile.value ? '重新选择' : '选择图片'))
const uploadButtonLabel = computed(() => {
  if (isUploading.value) {
    return '上传中'
  }

  if (src.value !== '') {
    return '已上传'
  }

  return '上传图片'
})

const canApply = computed(() => isImageReady.value && width.value !== null && height.value !== null)

function handleApply() {
  if (width.value === null || height.value === null) {
    return
  }

  emit('confirm', {
    src: src.value,
    alt: alt.value,
    width: width.value,
    height: height.value,
  })
  emit('update:show', false)
}

function initializeDialog() {
  const attrs = props.existingAttrs
  if (attrs === undefined) {
    return
  }

  src.value = attrs.src
  alt.value = attrs.alt ?? ''
  width.value = attrs.width ?? null
  height.value = attrs.height ?? null
}

function resetDialog() {
  activeUpload.value = null
  resetFileDialog()
  selectedFile.value = null
  resetImageState()
}

function resetImageState() {
  src.value = ''
  alt.value = ''
  width.value = null
  height.value = null
  naturalWidth.value = null
  naturalHeight.value = null
}

watch(
  () => props.show,
  (show) => {
    resetDialog()

    if (show) {
      initializeDialog()
    }
  },
  { immediate: true },
)

async function uploadImageFile() {
  const file = selectedFile.value
  if (file === null) {
    return
  }

  const upload = props.upload(file)
  activeUpload.value = upload
  try {
    const uploaded = await upload
    if (activeUpload.value !== upload) {
      return
    }

    src.value = uploaded.src
    alt.value = file.name
    selectedFile.value = null
  } catch (error) {
    if (activeUpload.value !== upload) {
      return
    }

    emit('error', error)
  } finally {
    if (activeUpload.value === upload) {
      activeUpload.value = null
    }
  }
}

function handleImageLoad(event: Event) {
  const image = event.target
  if (!(image instanceof HTMLImageElement) || image.getAttribute('src') !== src.value) {
    return
  }

  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    emit('error', new Error('图片尺寸无效'))
    return
  }

  naturalWidth.value = image.naturalWidth
  naturalHeight.value = image.naturalHeight

  if (width.value === null && height.value === null) {
    width.value = image.naturalWidth
    height.value = image.naturalHeight
  } else if (width.value !== null && height.value === null) {
    height.value = Math.max(1, Math.round((width.value * image.naturalHeight) / image.naturalWidth))
  } else if (width.value === null && height.value !== null) {
    width.value = Math.max(1, Math.round((height.value * image.naturalWidth) / image.naturalHeight))
  }
}

function handleImageError(event: Event) {
  const image = event.target
  if (!(image instanceof HTMLImageElement) || image.getAttribute('src') !== src.value) {
    return
  }

  emit('error', new Error('图片加载失败'))
}

function resetSize() {
  if (naturalWidth.value === null || naturalHeight.value === null) {
    return
  }

  width.value = naturalWidth.value
  height.value = naturalHeight.value
}

function updateWidth(value: number | null) {
  width.value = value
  if (value !== null && aspectRatio.value !== null) {
    height.value = Math.max(1, Math.round(value / aspectRatio.value))
  }
}

function updateHeight(value: number | null) {
  height.value = value
  if (value !== null && aspectRatio.value !== null) {
    width.value = Math.max(1, Math.round(value * aspectRatio.value))
  }
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="图片"
    class="w-[calc(100vw-32px)] max-w-lg"
    @update:show="emit('update:show', $event)"
  >
    <NSpin :show="isUploading">
      <div class="flex flex-col gap-3">
        <div
          v-if="!isExistingImage"
          ref="dropZoneRef"
          data-test="rich-text-image-drop-zone"
          class="flex w-fit rounded-ui transition-[outline-color,outline-width]"
          :class="isOverDropZone ? 'outline-2 outline-offset-2 outline-primary outline-solid' : ''"
        >
          <NImage
            v-if="displayPreviewSrc"
            data-test="rich-text-image-preview"
            class="max-w-full"
            :img-props="{ class: 'block max-h-28 max-w-full' }"
            :src="displayPreviewSrc"
            :alt="alt"
            @load="handleImageLoad"
            @error="handleImageError"
          />
          <div
            v-else
            data-test="rich-text-image-preview-area"
            class="flex size-28 items-center justify-center rounded-ui border border-input-border bg-input"
          >
            <span class="i-[lucide--image] text-2xl opacity-20" aria-hidden="true" />
          </div>
        </div>
        <NImage
          v-else-if="displayPreviewSrc"
          data-test="rich-text-image-preview"
          class="max-w-full"
          :img-props="{ class: 'block max-h-28 max-w-full' }"
          :src="displayPreviewSrc"
          :alt="alt"
          @load="handleImageLoad"
          @error="handleImageError"
        />
        <div
          v-else
          data-test="rich-text-image-preview-area"
          class="flex size-28 items-center justify-center rounded-ui border border-input-border bg-input"
        >
          <span class="i-[lucide--image] text-2xl opacity-20" aria-hidden="true" />
        </div>

        <div v-if="!isExistingImage" data-test="rich-text-image-upload" class="flex w-fit gap-2">
          <NButton
            data-test="rich-text-image-file"
            class="flex-1"
            :disabled="!canSelectFile"
            @click="openFileDialog()"
          >
            <template #icon>
              <span class="i-[lucide--image-plus]" aria-hidden="true" />
            </template>
            {{ selectButtonLabel }}
          </NButton>
          <NButton
            data-test="rich-text-image-upload-action"
            type="primary"
            secondary
            :loading="isUploading"
            :disabled="!hasSelectedFile || isUploading"
            @click.stop="uploadImageFile"
          >
            <template v-if="src" #icon>
              <span class="i-[lucide--check]" aria-hidden="true" />
            </template>
            {{ uploadButtonLabel }}
          </NButton>
        </div>

        <NFormItem label="图片说明">
          <NInput
            data-test="rich-text-image-alt"
            :disabled="!isImageReady"
            :value="alt"
            @update:value="alt = $event"
          />
        </NFormItem>

        <div class="grid grid-cols-2 gap-3">
          <NFormItem label="宽度">
            <NInputNumber
              data-test="rich-text-image-width"
              :disabled="!isImageReady"
              :value="width"
              :min="1"
              @update:value="updateWidth"
            />
          </NFormItem>

          <NFormItem label="高度">
            <NInputNumber
              data-test="rich-text-image-height"
              :disabled="!isImageReady"
              :value="height"
              :min="1"
              @update:value="updateHeight"
            />
          </NFormItem>
        </div>

        <div class="flex justify-between gap-2">
          <NButton
            data-test="rich-text-image-reset-size"
            :disabled="!isImageReady"
            @click="resetSize"
          >
            重置尺寸
          </NButton>

          <div class="flex gap-2">
            <NButton data-test="rich-text-image-cancel" @click="emit('update:show', false)">
              取消
            </NButton>
            <NButton
              data-test="rich-text-image-confirm"
              type="primary"
              :disabled="!canApply"
              @click="handleApply"
            >
              确定
            </NButton>
          </div>
        </div>
      </div>
    </NSpin>
  </NModal>
</template>
