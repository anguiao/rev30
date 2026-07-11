<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextToolbarControlConfig } from '../toolbar'
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
    :item="control.item"
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
    v-bind="control.props"
    :editor="editor"
    :disabled="disabled"
  />
</template>
