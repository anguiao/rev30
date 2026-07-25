<script setup lang="ts">
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import CodeBlockLanguageControl from './CodeBlockLanguageControl.vue'

interface CodeBlockQuickBarProps extends RichTextQuickBarComponentProps {
  languages: readonly {
    readonly label: string
    readonly value: string
  }[]
}

const props = defineProps<CodeBlockQuickBarProps>()

const emit = defineEmits<{
  close: []
}>()

const editor = props.editor
</script>

<template>
  <div class="contents">
    <CodeBlockLanguageControl
      :editor="editor"
      :languages="languages"
      surface="quick-bar"
      show-label
      @close="emit('close')"
    />
  </div>
</template>
