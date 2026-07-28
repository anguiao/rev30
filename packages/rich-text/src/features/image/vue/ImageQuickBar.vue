<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { getSelectedImageAttrs } from '../editor'

interface ImageQuickBarProps extends RichTextQuickBarComponentProps {
  openDialog: (editor: Editor) => void
}

const props = defineProps<ImageQuickBarProps>()

const editor = props.editor
const image = computed(() => getSelectedImageAttrs(editor.state.selection))
</script>

<template>
  <div class="contents">
    <NButton
      tag="a"
      data-test="rich-text-quick-bar-image-download"
      data-rich-text-toolbar-item="image-download"
      :href="image?.src"
      download
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="下载图片"
      aria-label="下载图片"
    >
      <span class="i-[lucide--download]" aria-hidden="true" />
    </NButton>
    <NButton
      data-test="rich-text-quick-bar-image"
      data-rich-text-toolbar-item="image-edit"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="编辑图片"
      aria-label="编辑图片"
      @click="openDialog(editor)"
    >
      <span class="i-[lucide--pencil]" aria-hidden="true" />
    </NButton>
  </div>
</template>
