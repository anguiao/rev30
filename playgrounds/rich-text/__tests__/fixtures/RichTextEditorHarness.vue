<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, lightTheme } from 'naive-ui'
import { ref } from 'vue'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import { RichTextEditor } from '@rev30/rich-text/vue'
import { createDefaultDocument } from '../../src/playground/defaultDocument'
import { createPlaygroundPresets } from '../../src/playground/presets'
import '../../src/style.css'

const model = ref<RichTextDocument>(createDefaultDocument())
const blurCount = ref(0)
const imageError = ref<string | null>(null)
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
</script>

<template>
  <NConfigProvider :theme="lightTheme">
    <NGlobalStyle />
    <button data-test="before-editor">编辑器前控件</button>
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
    <output v-if="imageError" data-test="image-error">{{ imageError }}</output>
  </NConfigProvider>
</template>
