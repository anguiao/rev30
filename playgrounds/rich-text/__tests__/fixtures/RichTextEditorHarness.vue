<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, lightTheme } from 'naive-ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import { RichTextEditor } from '@rev30/rich-text/vue'
import { createDefaultDocument } from '../../src/playground/defaultDocument'
import { createPlaygroundPresets } from '../../src/playground/presets'
import '../../src/style.css'

const model = ref<RichTextDocument>(createDefaultDocument())
const blurCount = ref(0)
const imageError = ref<string | null>(null)
const selectionText = ref('')
const activeElement = ref('')
const presets = createPlaygroundPresets({
  onImageError(error) {
    imageError.value = error instanceof Error ? error.message : '读取图片失败'
  },
  onImageSuccess() {
    imageError.value = null
  },
})

function handleBlur() {
  blurCount.value += 1
}

function updateInteractionState() {
  selectionText.value = window.getSelection()?.toString() ?? ''
  const element = document.activeElement
  const dialog = element?.closest<HTMLElement>('[role="dialog"]')
  activeElement.value =
    element?.getAttribute('data-rich-text-toolbar-item') ??
    element?.getAttribute('data-test') ??
    element?.getAttribute('aria-label') ??
    (element?.tagName.toLowerCase() === 'input' ? 'input' : undefined) ??
    (dialog ? `dialog:${dialog.getAttribute('aria-label') ?? ''}` : undefined) ??
    (element?.getAttribute('contenteditable') === 'true'
      ? 'editor'
      : (element?.tagName.toLowerCase() ?? ''))
}

function resetShortDocument() {
  model.value = { type: 'doc', content: [{ type: 'paragraph' }] }
}

function setPasteDocument() {
  model.value = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '文档' }] }],
  }
}

onMounted(() => {
  document.addEventListener('selectionchange', updateInteractionState)
  document.addEventListener('focusin', updateInteractionState)
  updateInteractionState()
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', updateInteractionState)
  document.removeEventListener('focusin', updateInteractionState)
})
</script>

<template>
  <NConfigProvider :theme="lightTheme">
    <NGlobalStyle />
    <button data-test="before-editor">编辑器前控件</button>
    <div class="flex gap-2">
      <button data-test="reset-short-document" @click="resetShortDocument">短文档</button>
      <button data-test="set-paste-document" @click="setPasteDocument">粘贴文档</button>
    </div>
    <div class="h-[560px] w-[900px] overflow-auto" data-test="editor-container">
      <RichTextEditor
        :model-value="model"
        :preset="presets.editorPreset"
        :min-height="320"
        @blur="handleBlur"
        @update:model-value="model = $event"
      />
    </div>
    <button data-test="after-editor">编辑器后控件</button>
    <output data-test="model-json">{{ JSON.stringify(model) }}</output>
    <output data-test="blur-count">{{ blurCount }}</output>
    <output data-test="selection-text">{{ selectionText }}</output>
    <output data-test="active-element">{{ activeElement }}</output>
    <output v-if="imageError" data-test="image-error">{{ imageError }}</output>
  </NConfigProvider>
</template>
