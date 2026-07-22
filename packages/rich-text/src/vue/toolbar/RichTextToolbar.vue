<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextToolbarConfig } from '../toolbar'
import RichTextToolbarControl from './RichTextToolbarControl.vue'

const props = withDefaults(
  defineProps<{
    editor: Editor
    toolbar: RichTextToolbarConfig
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const groups = props.toolbar.groups.filter((group) => group.controls.length > 0)
</script>

<template>
  <div
    class="flex shrink-0 flex-wrap gap-1 border-b border-(--rich-text-theme-input-divider-color) px-2 py-1"
  >
    <div
      v-for="(group, index) in groups"
      :key="group.key"
      data-test="rich-text-toolbar-group"
      class="flex items-center gap-1"
      :class="
        index === 0 ? undefined : 'border-l border-(--rich-text-theme-input-divider-color) pl-1'
      "
    >
      <RichTextToolbarControl
        v-for="control in group.controls"
        :key="control.type === 'button' ? control.item.action.key : control.key"
        :control="control"
        :editor="editor"
        :disabled="disabled"
      />
    </div>
  </div>
</template>
