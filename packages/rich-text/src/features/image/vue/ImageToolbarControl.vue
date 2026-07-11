<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { RichTextImageAttrs } from '../shared'
import { NButton } from 'naive-ui'
import { computed, ref } from 'vue'
import { insertImageAction, updateImageAction } from '../editor'
import ImageDialog from './ImageDialog.vue'

interface ImageToolbarControlProps extends RichTextToolbarControlInjectedProps {
  upload: (file: File) => Promise<{ src: string }>
  onError?: (error: unknown) => void
}

const props = withDefaults(defineProps<ImageToolbarControlProps>(), {
  disabled: false,
})

const isDisabled = computed(() => props.disabled || !props.editor)
const isActive = computed(() => props.editor?.isActive('image') ?? false)

const buttonLabel = computed(() => (isActive.value ? '编辑图片' : '图片'))
const currentAttrs = computed(() =>
  isActive.value ? (props.editor?.getAttributes('image') as RichTextImageAttrs) : undefined,
)

const showDialog = ref(false)

function openDialog() {
  if (isDisabled.value) {
    return
  }

  showDialog.value = true
}

function handleConfirm(attrs: RichTextImageAttrs) {
  if (!props.editor) {
    return
  }

  if (isActive.value) {
    updateImageAction.run(props.editor, attrs)
    return
  }

  insertImageAction.run(props.editor, attrs)
}

function handleError(error: unknown) {
  props.onError?.(error)
}
</script>

<template>
  <NButton
    data-test="rich-text-image"
    :data-active="isActive ? 'true' : undefined"
    :disabled="isDisabled"
    size="small"
    style="--n-padding: 0 6px"
    :type="isActive ? 'primary' : 'default'"
    :secondary="isActive"
    :quaternary="!isActive"
    :title="buttonLabel"
    :aria-label="buttonLabel"
    :aria-pressed="isActive"
    @mousedown.prevent
    @click="openDialog"
  >
    <span class="i-[lucide--image]" aria-hidden="true" />
  </NButton>
  <ImageDialog
    v-model:show="showDialog"
    :existing-attrs="currentAttrs"
    :upload="upload"
    @confirm="handleConfirm"
    @error="handleError"
  />
</template>
