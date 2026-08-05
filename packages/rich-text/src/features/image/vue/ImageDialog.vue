<script setup lang="ts">
import { getFirstClipboardImageFile, type RichTextImageAttrs } from '../editor'
import { NButton, NFormItem, NImage, NInput, NInputNumber, NModal, NSpin } from 'naive-ui'
import { useDropZone, useFileDialog, useObjectUrl } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, shallowRef, type Ref, useTemplateRef } from 'vue'
import { useRichTextThemeStyle } from '../../../vue/theme'

const props = defineProps<{
  upload: (file: File) => Promise<{ src: string }>
  existingImage?: RichTextImageAttrs | undefined
  initialImageFile?: File | undefined
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [attrs: RichTextImageAttrs]
  error: [error: unknown]
}>()

const richTextThemeStyle = useRichTextThemeStyle()

const isEditing = props.existingImage !== undefined

const selectedImageFile = shallowRef<File | null>(props.initialImageFile ?? null)
const hasSelectedImageFile = computed(() => selectedImageFile.value !== null)
const localPreviewSrc = useObjectUrl(selectedImageFile)

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const { open: openFileDialog, onChange: onFileDialogChange } = useFileDialog({
  accept: 'image/*',
  input: fileInput as Ref<HTMLInputElement>,
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

const dropZoneRef = useTemplateRef<HTMLElement>('dropZoneRef')
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

const src = ref(props.existingImage?.src ?? '')
const alt = ref(props.existingImage?.alt ?? '')
const width = ref<number | null>(props.existingImage?.width ?? null)
const height = ref<number | null>(props.existingImage?.height ?? null)
const naturalWidth = ref<number | null>(null)
const naturalHeight = ref<number | null>(null)
const activeUpload = shallowRef<Promise<{ src: string }> | null>(null)
const isUploading = computed(() => activeUpload.value !== null)
const pendingRemoteImageFile = shallowRef<File | null>(null)
const isLoadingUploadedImage = computed(
  () => pendingRemoteImageFile.value !== null && src.value !== '',
)
const canSelectFile = computed(() => !isUploading.value && !isLoadingUploadedImage.value)
const aspectRatio = computed(() =>
  naturalWidth.value === null || naturalHeight.value === null
    ? null
    : naturalWidth.value / naturalHeight.value,
)

const isImageReady = computed(
  () => src.value !== '' && naturalWidth.value !== null && naturalHeight.value !== null,
)

const displayPreviewSrc = computed(() => src.value || localPreviewSrc.value || '')
const selectButtonLabel = computed(() => (hasSelectedImageFile.value ? '重新选择' : '选择图片'))
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
const canUpload = computed(
  () => hasSelectedImageFile.value && !isUploading.value && src.value === '',
)

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
}

function resetCandidateImageState() {
  src.value = ''
  naturalWidth.value = null
  naturalHeight.value = null
  pendingRemoteImageFile.value = null

  if (!isEditing) {
    alt.value = ''
    width.value = null
    height.value = null
  }
}

function selectLocalImageFile(file: File) {
  selectedImageFile.value = file
  resetCandidateImageState()
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false
  }

  return (
    target.matches('input, textarea, [contenteditable]') ||
    target.closest('[contenteditable]') !== null
  )
}

function handlePaste(event: ClipboardEvent) {
  if (event.defaultPrevented || !canSelectFile.value || isTextEntryTarget(event.target)) {
    return
  }

  const imageFile = getFirstClipboardImageFile(event.clipboardData?.files)

  if (imageFile === null) {
    return
  }

  event.preventDefault()
  selectLocalImageFile(imageFile)
}

function clearFailedRemoteImage(error: Error) {
  emit('error', error)
  src.value = ''
  naturalWidth.value = null
  naturalHeight.value = null
  pendingRemoteImageFile.value = null
}

onBeforeUnmount(() => {
  activeUpload.value = null
  pendingRemoteImageFile.value = null
})

async function uploadImageFile() {
  const file = selectedImageFile.value
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

    if (uploaded.src === '') {
      clearFailedRemoteImage(new Error('图片加载失败'))
      return
    }

    pendingRemoteImageFile.value = file
    naturalWidth.value = null
    naturalHeight.value = null
    src.value = uploaded.src
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
    if (pendingRemoteImageFile.value !== null) {
      clearFailedRemoteImage(new Error('图片尺寸无效'))
    } else {
      emit('error', new Error('图片尺寸无效'))
    }
    return
  }

  naturalWidth.value = image.naturalWidth
  naturalHeight.value = image.naturalHeight

  const uploadedImageFile = pendingRemoteImageFile.value

  if (uploadedImageFile !== null) {
    const existingImageWidth = props.existingImage?.width

    if (
      isEditing &&
      existingImageWidth !== null &&
      existingImageWidth !== undefined &&
      Number.isInteger(existingImageWidth) &&
      existingImageWidth > 0
    ) {
      width.value = existingImageWidth
      height.value = Math.max(
        1,
        Math.round((existingImageWidth * image.naturalHeight) / image.naturalWidth),
      )
    } else {
      width.value = image.naturalWidth
      height.value = image.naturalHeight
    }

    if (!isEditing) {
      alt.value = uploadedImageFile.name
    }

    pendingRemoteImageFile.value = null
    selectedImageFile.value = null
    return
  }

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

  if (pendingRemoteImageFile.value !== null) {
    clearFailedRemoteImage(new Error('图片加载失败'))
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
    :show="true"
    preset="card"
    title="图片"
    aria-label="图片"
    class="rich-text-theme w-[calc(100vw-32px)] max-w-lg"
    :style="richTextThemeStyle"
    @update:show="emit('cancel')"
  >
    <NSpin :show="isUploading">
      <div
        data-test="rich-text-image-dialog-content"
        class="flex flex-col gap-3"
        @paste="handlePaste"
      >
        <div
          ref="dropZoneRef"
          data-test="rich-text-image-drop-zone"
          class="flex w-fit rounded-(--rich-text-theme-border-radius) transition-[outline-color,outline-width]"
          :class="
            isOverDropZone
              ? 'outline-2 outline-offset-2 outline-(--rich-text-theme-primary-color) outline-solid'
              : ''
          "
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
            class="flex size-28 items-center justify-center rounded-(--rich-text-theme-border-radius) border border-(--rich-text-theme-input-border-color) bg-(--rich-text-theme-input-color)"
          >
            <span class="i-[lucide--image] text-2xl opacity-20" aria-hidden="true" />
          </div>
        </div>

        <div data-test="rich-text-image-upload" class="flex w-fit gap-2">
          <input
            ref="fileInput"
            data-test="rich-text-image-file-input"
            class="hidden"
            type="file"
            accept="image/*"
          />
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
            :disabled="!canUpload"
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
              :precision="0"
              @update:value="updateWidth"
            />
          </NFormItem>

          <NFormItem label="高度">
            <NInputNumber
              :disabled="!isImageReady"
              :value="height"
              :min="1"
              :precision="0"
              @update:value="updateHeight"
            />
          </NFormItem>
        </div>

        <div class="flex justify-between gap-2">
          <NButton :disabled="!isImageReady" @click="resetSize"> 重置尺寸 </NButton>

          <div class="flex gap-2">
            <NButton data-test="rich-text-image-cancel" @click="emit('cancel')"> 取消 </NButton>
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
