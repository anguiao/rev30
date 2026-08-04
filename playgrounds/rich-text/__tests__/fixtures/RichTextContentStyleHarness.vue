<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, lightTheme } from 'naive-ui'
import { ref } from 'vue'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import { RichTextEditor } from '@rev30/rich-text/vue'
import { createAllRichTextEditorPreset } from '@rev30/rich-text/vue/presets/all'

const props = defineProps<{
  document: RichTextDocument
  html: string
  dark?: boolean
}>()

const model = ref(props.document)
const preset = createAllRichTextEditorPreset({
  image: {
    async upload() {
      throw new Error('Image upload is unavailable in the content style harness')
    },
  },
})
</script>

<template>
  <NConfigProvider :theme="lightTheme">
    <NGlobalStyle />
    <div :class="{ dark }">
      <RichTextEditor
        data-test="style-editor"
        :model-value="model"
        :preset="preset"
        :min-height="320"
      />
      <div
        data-test="style-readonly-sm"
        class="rich-text-content rich-text-content--sm"
        v-html="html"
      />
      <div
        data-test="style-readonly-base"
        class="rich-text-content rich-text-content--base"
        v-html="html"
      />
      <div
        data-test="style-readonly-lg"
        class="rich-text-content rich-text-content--lg"
        v-html="html"
      />
    </div>
  </NConfigProvider>
</template>
