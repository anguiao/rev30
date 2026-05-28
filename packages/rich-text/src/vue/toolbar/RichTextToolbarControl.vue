<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextToolbarControlConfig } from './types'
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
  <RichTextToolbarDropdown
    v-else-if="control.type === 'dropdown'"
    :control="control"
    :editor="editor"
    :disabled="disabled"
  />

  <component
    :is="control.component"
    v-else
    :editor="editor"
    :disabled="disabled"
    v-bind="control.props"
  />
</template>
