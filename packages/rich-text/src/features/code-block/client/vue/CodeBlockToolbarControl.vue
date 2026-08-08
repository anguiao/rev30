<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { RichTextToolbarControlProps } from '../../../../client/vue/toolbar'
import CodeBlockLanguageControl from './CodeBlockLanguageControl.vue'

const props = withDefaults(defineProps<RichTextToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
</script>

<template>
  <CodeBlockLanguageControl :editor="editor" :disabled="disabled">
    <template #trigger="trigger">
      <NButton
        data-test="rich-text-code-block"
        data-rich-text-toolbar-item="code-block"
        :disabled="trigger.disabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="trigger.active ? 'primary' : 'default'"
        :secondary="trigger.active"
        :quaternary="!trigger.active"
        title="代码块"
        aria-label="代码块"
        :aria-pressed="trigger.active"
        aria-haspopup="menu"
        :aria-expanded="trigger.show"
        @keydown="trigger.handleKeydown"
      >
        <span class="i-[lucide--square-code]" aria-hidden="true" />
        <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </template>
  </CodeBlockLanguageControl>
</template>
