<script setup lang="ts">
import { NButton } from 'naive-ui'
import { computed, ref } from 'vue'
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import { insertRichTextImage, updateRichTextImage } from '../commands'
import type { RichTextImageAttrs } from '../shared'
import ImageDialog from './ImageDialog.vue'

interface ImageToolbarControlProps extends RichTextToolbarControlInjectedProps {
  accept?: string
  upload: (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>
  onError?: (error: unknown) => void
}

const props = defineProps<ImageToolbarControlProps>()

const showDialog = ref(false)
const isEditMode = computed(() => props.editor?.isActive('image') ?? false)
const currentAttrs = computed(() =>
  isEditMode.value ? (props.editor?.getAttributes('image') as RichTextImageAttrs) : null,
)

function openDialog() {
  if (props.disabled || props.editor === null) {
    return
  }

  showDialog.value = true
}

function handleConfirm(attrs: RichTextImageAttrs) {
  if (!props.editor) {
    return
  }

  if (isEditMode.value) {
    updateRichTextImage(props.editor, attrs)
    return
  }

  insertRichTextImage(props.editor, attrs)
}

function handleError(error: unknown) {
  props.onError?.(error)
}
</script>

<template>
  <NButton
    data-test="rich-text-image"
    quaternary
    size="small"
    title="图片"
    aria-label="图片"
    :disabled="disabled || editor === null"
    :data-active="isEditMode ? 'true' : undefined"
    :aria-pressed="isEditMode"
    @mousedown.prevent
    @click="openDialog"
  >
    <span class="i-[lucide--image]" aria-hidden="true" />
  </NButton>
  <ImageDialog
    v-model:show="showDialog"
    :mode="isEditMode ? 'edit' : 'insert'"
    :accept="accept"
    :upload="upload"
    :initial-attrs="currentAttrs"
    @confirm="handleConfirm"
    @error="handleError"
  />
</template>
