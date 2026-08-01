<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import CodeBlockLanguageControl from './CodeBlockLanguageControl.vue'

const props = defineProps<RichTextQuickBarComponentProps>()

const editor = props.editor
</script>

<template>
  <CodeBlockLanguageControl :editor="editor">
    <template #trigger="trigger">
      <NButton
        data-test="rich-text-code-block-language"
        data-rich-text-toolbar-item="code-block-language"
        :disabled="trigger.disabled"
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        :title="`代码语言：${trigger.languageLabel}`"
        :aria-label="`代码语言：${trigger.languageLabel}`"
        aria-haspopup="menu"
        :aria-expanded="trigger.show"
        @keydown="trigger.handleKeydown"
      >
        <span class="mr-1 text-xs">{{ trigger.languageLabel }}</span>
        <span class="i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </template>
  </CodeBlockLanguageControl>
</template>
