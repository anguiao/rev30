<script setup lang="ts">
import type { RichTextImageAttrs } from '../shared'
import { NButton, NFormItem, NInput, NInputNumber, NModal, NSpin } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { loadImageNaturalSize } from './image-size'

type DialogMode = 'insert' | 'edit'
type ImageUpload = (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>

const props = defineProps<{
  show: boolean
  mode: DialogMode
  accept?: string | undefined
  upload: ImageUpload
  initialAttrs?: RichTextImageAttrs | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [attrs: RichTextImageAttrs]
  error: [error: unknown]
}>()

const selectedFileName = ref('')
const previewSrc = ref('')
const alt = ref('')
const width = ref<number | null>(null)
const height = ref<number | null>(null)
const naturalWidth = ref<number | null>(null)
const naturalHeight = ref<number | null>(null)
const originalAspectRatio = ref<number | null>(null)
const isSizeLoadFailed = ref(false)
const isUploading = ref(false)
const isLoadingSize = ref(false)

const aspectRatio = computed(() =>
  naturalWidth.value !== null &&
  naturalHeight.value !== null &&
  naturalWidth.value > 0 &&
  naturalHeight.value > 0
    ? naturalWidth.value / naturalHeight.value
    : originalAspectRatio.value,
)
const canConfirm = computed(
  () =>
    previewSrc.value !== '' &&
    isPositiveInteger(width.value) &&
    isPositiveInteger(height.value) &&
    (aspectRatio.value !== null || canConfirmAfterSizeLoadFailure()) &&
    !isUploading.value &&
    !isLoadingSize.value,
)

watch(
  () => props.show,
  (show) => {
    if (!show) {
      return
    }

    if (props.mode === 'edit' && props.initialAttrs) {
      initializeEditState(props.initialAttrs)
      return
    }

    initializeInsertState()
  },
)

function isPositiveInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function initializeInsertState() {
  selectedFileName.value = ''
  previewSrc.value = ''
  alt.value = ''
  width.value = null
  height.value = null
  naturalWidth.value = null
  naturalHeight.value = null
  originalAspectRatio.value = null
  isSizeLoadFailed.value = false
}

function initializeEditState(attrs: RichTextImageAttrs) {
  selectedFileName.value = ''
  previewSrc.value = attrs.src
  alt.value = attrs.alt ?? ''
  width.value = attrs.width ?? null
  height.value = attrs.height ?? null
  naturalWidth.value = null
  naturalHeight.value = null
  originalAspectRatio.value =
    isPositiveInteger(width.value) && isPositiveInteger(height.value)
      ? width.value / height.value
      : null
  isSizeLoadFailed.value = false
  void loadSize(attrs.src)
}

async function loadSize(src: string) {
  isLoadingSize.value = true
  isSizeLoadFailed.value = false

  try {
    const size = await loadImageNaturalSize(src)
    naturalWidth.value = size.width
    naturalHeight.value = size.height

    normalizeSize()
  } catch (error) {
    isSizeLoadFailed.value = true
    emit('error', error)
  } finally {
    isLoadingSize.value = false
  }
}

function canConfirmAfterSizeLoadFailure() {
  return props.mode === 'edit' && isSizeLoadFailed.value
}

function resetSize() {
  if (naturalWidth.value === null || naturalHeight.value === null) {
    return
  }

  width.value = naturalWidth.value
  height.value = naturalHeight.value
}

function normalizeSize() {
  if (aspectRatio.value === null) {
    return
  }

  if (isPositiveInteger(width.value)) {
    setWidth(width.value)
    return
  }

  if (isPositiveInteger(height.value)) {
    setHeight(height.value)
    return
  }

  resetSize()
}

function setWidth(value: number | null) {
  width.value = value
  if (value !== null && aspectRatio.value !== null) {
    height.value = Math.round(value / aspectRatio.value)
  }
}

function setHeight(value: number | null) {
  height.value = value
  if (value !== null && aspectRatio.value !== null) {
    width.value = Math.round(value * aspectRatio.value)
  }
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  selectedFileName.value = file.name
  isUploading.value = true
  try {
    const uploaded = await props.upload(file)
    previewSrc.value = uploaded.src
    alt.value = uploaded.alt ?? file.name
    width.value = null
    height.value = null
    naturalWidth.value = null
    naturalHeight.value = null
    originalAspectRatio.value = null
    isSizeLoadFailed.value = false
    await loadSize(uploaded.src)
  } catch (error) {
    emit('error', error)
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

function confirm() {
  if (!canConfirm.value || width.value === null || height.value === null) {
    return
  }

  const trimmedAlt = alt.value.trim()
  const attrs: RichTextImageAttrs = {
    src: previewSrc.value,
    width: width.value,
    height: height.value,
  }

  if (trimmedAlt) {
    attrs.alt = trimmedAlt
  }

  emit('confirm', attrs)
  emit('update:show', false)
}
</script>

<template>
  <NModal :show="show" preset="card" title="图片" @update:show="emit('update:show', $event)">
    <NSpin :show="isUploading || isLoadingSize">
      <div class="flex flex-col gap-3">
        <input
          data-test="rich-text-image-file"
          type="file"
          :accept="accept"
          @change="handleFileChange"
        />
        <div v-if="selectedFileName" class="text-xs opacity-70">{{ selectedFileName }}</div>

        <img
          v-if="previewSrc"
          data-test="rich-text-image-preview"
          class="max-h-64 max-w-full object-contain"
          :src="previewSrc"
          :alt="alt"
        />

        <NFormItem label="图片说明">
          <NInput data-test="rich-text-image-alt" :value="alt" @update:value="alt = $event" />
        </NFormItem>

        <div class="grid grid-cols-2 gap-3">
          <NFormItem label="宽度">
            <NInputNumber
              data-test="rich-text-image-width"
              :value="width"
              :min="1"
              @update:value="setWidth"
            />
          </NFormItem>

          <NFormItem label="高度">
            <NInputNumber
              data-test="rich-text-image-height"
              :value="height"
              :min="1"
              @update:value="setHeight"
            />
          </NFormItem>
        </div>

        <div class="flex justify-between gap-2">
          <NButton data-test="rich-text-image-reset-size" @click="resetSize">重置尺寸</NButton>

          <div class="flex gap-2">
            <NButton data-test="rich-text-image-cancel" @click="emit('update:show', false)">
              取消
            </NButton>
            <NButton
              data-test="rich-text-image-confirm"
              type="primary"
              :disabled="!canConfirm"
              @click="confirm"
            >
              确定
            </NButton>
          </div>
        </div>
      </div>
    </NSpin>
  </NModal>
</template>
