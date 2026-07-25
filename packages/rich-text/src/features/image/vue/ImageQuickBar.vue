<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { getSelectedImageAttrs } from '../editor'

interface ImageQuickBarProps extends RichTextQuickBarComponentProps {
  openDialog: (editor: Editor) => boolean
}

const props = defineProps<ImageQuickBarProps>()

const editor = props.editor
const selectedImage = computed(() => getSelectedImageAttrs(editor))
const isDisabled = computed(() => selectedImage.value === null)

function handleEdit() {
  if (isDisabled.value) {
    return
  }

  props.openDialog(editor)
}
</script>

<template>
  <div class="contents">
    <NButton
      tag="a"
      data-test="rich-text-quick-bar-image-download"
      data-rich-text-quick-bar-roving
      :href="isDisabled ? undefined : selectedImage?.src"
      download
      :disabled="isDisabled"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="下载图片"
      aria-label="下载图片"
      @mousedown.prevent
    >
      <span class="i-[lucide--download]" aria-hidden="true" />
    </NButton>
    <NButton
      data-test="rich-text-quick-bar-image"
      data-rich-text-quick-bar-roving
      :disabled="isDisabled"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="编辑图片"
      aria-label="编辑图片"
      @mousedown.prevent
      @click="handleEdit"
    >
      <span class="i-[lucide--pencil]" aria-hidden="true" />
    </NButton>
  </div>
</template>
