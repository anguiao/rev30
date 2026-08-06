<script setup lang="ts">
import { getPastedImageFile, type RichTextImageAttrs } from '../editor'
import { NButton, NFormItem, NImage, NInput, NInputNumber, NModal, NSpin } from 'naive-ui'
import { useDropZone, useFileDialog, useObjectUrl } from '@vueuse/core'
import { computed, ref, shallowRef, type Ref, useTemplateRef } from 'vue'
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

const existingImage = props.existingImage
const initialImageFile = props.initialImageFile ?? null
const selectedImageFile = shallowRef<File | null>(initialImageFile)

const localPreviewSrc = useObjectUrl(selectedImageFile)
const src = ref(initialImageFile === null ? (existingImage?.src ?? '') : '')

const alt = ref(existingImage?.alt ?? '')
const width = ref<number | null>(existingImage?.width ?? null)
const height = ref<number | null>(existingImage?.height ?? null)

const naturalSize = shallowRef<{ readonly width: number; readonly height: number } | null>(null)
const aspectRatio = computed(() => {
  const size = naturalSize.value
  return size === null ? null : size.width / size.height
})
const isImageReady = computed(() => naturalSize.value !== null)

const isUploading = ref(false)

const displayPreviewSrc = computed(() => src.value || localPreviewSrc.value || '')
const selectButtonLabel = computed(() =>
  selectedImageFile.value === null ? '选择图片' : '重新选择',
)
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
  () => selectedImageFile.value !== null && !isUploading.value && src.value === '',
)

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const { open: openFileDialog, onChange: onFileDialogChange } = useFileDialog({
  accept: 'image/*',
  input: fileInput as Ref<HTMLInputElement>,
  multiple: false,
  reset: true,
})
onFileDialogChange((files) => {
  const file = files?.item(0)
  if (file) {
    selectLocalImageFile(file)
  }
})

const dropZoneRef = useTemplateRef<HTMLElement>('dropZoneRef')
const { isOverDropZone } = useDropZone(dropZoneRef, {
  multiple: false,
  preventDefaultForUnhandled: true,
  checkValidity: () => !isUploading.value,
  onDrop(files) {
    const file = files?.[0]
    if (file?.type.startsWith('image/')) {
      selectLocalImageFile(file)
    }
  },
})

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

function selectLocalImageFile(file: File) {
  selectedImageFile.value = file
  src.value = ''
  naturalSize.value = null

  if (existingImage === undefined) {
    alt.value = ''
    width.value = null
    height.value = null
  }
}

function handlePaste(event: ClipboardEvent) {
  if (event.defaultPrevented || isUploading.value) {
    return
  }

  const imageFile = getPastedImageFile(event)

  if (imageFile === null) {
    return
  }

  event.preventDefault()
  selectLocalImageFile(imageFile)
}

function reportImageFailure(error: Error) {
  if (selectedImageFile.value !== null) {
    src.value = ''
    naturalSize.value = null
  }

  emit('error', error)
}

async function uploadImageFile() {
  const file = selectedImageFile.value
  if (file === null) {
    return
  }

  const upload = props.upload(file)
  isUploading.value = true
  try {
    const uploaded = await upload
    if (uploaded.src === '') {
      reportImageFailure(new Error('图片加载失败'))
      return
    }

    src.value = uploaded.src
  } catch (error) {
    emit('error', error)
  } finally {
    isUploading.value = false
  }
}

function handleImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.getAttribute('src') !== src.value) {
    return
  }

  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    reportImageFailure(new Error('图片尺寸无效'))
    return
  }

  const loadedSize = {
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
  naturalSize.value = loadedSize

  const uploadedImageFile = selectedImageFile.value

  if (uploadedImageFile !== null) {
    const displayWidth = existingImage?.width ?? loadedSize.width
    width.value = displayWidth
    height.value = Math.max(1, Math.round((displayWidth * loadedSize.height) / loadedSize.width))

    if (existingImage === undefined) {
      alt.value = uploadedImageFile.name
    }

    selectedImageFile.value = null
    return
  }

  if (width.value === null && height.value === null) {
    width.value = loadedSize.width
    height.value = loadedSize.height
  } else if (width.value !== null && height.value === null) {
    height.value = Math.max(1, Math.round((width.value * loadedSize.height) / loadedSize.width))
  } else if (width.value === null && height.value !== null) {
    width.value = Math.max(1, Math.round((height.value * loadedSize.width) / loadedSize.height))
  }
}

function handleImageError(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.getAttribute('src') !== src.value) {
    return
  }

  reportImageFailure(new Error('图片加载失败'))
}

function resetSize() {
  const size = naturalSize.value
  if (size === null) {
    return
  }

  width.value = size.width
  height.value = size.height
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
            :key="displayPreviewSrc"
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
            :disabled="isUploading"
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

        <div class="flex flex-col gap-3" @paste.stop>
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
