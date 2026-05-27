<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextToolbarControlConfig } from '../../core/toolbar'
import RichTextToolbarButton from './RichTextToolbarButton.vue'
import RichTextToolbarDropdown from './RichTextToolbarDropdown.vue'

defineProps<{
  control: RichTextToolbarControlConfig
  editor: Editor | null
  disabled?: boolean
}>()
</script>

<template>
  <RichTextToolbarButton
    v-if="control.type === 'button'"
    :command="control.command"
    :editor="editor"
    :disabled="disabled"
  />
  <RichTextToolbarDropdown v-else :control="control" :editor="editor" :disabled="disabled" />
</template>
