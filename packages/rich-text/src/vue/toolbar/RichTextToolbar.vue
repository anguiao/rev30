<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { computed } from 'vue'
import type { RichTextToolbarConfig } from './types'
import RichTextToolbarControl from './RichTextToolbarControl.vue'

const props = withDefaults(
  defineProps<{
    editor: Editor | null
    toolbar: RichTextToolbarConfig
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const groups = computed(() => props.toolbar.groups.filter((group) => group.controls.length > 0))
</script>

<template>
  <template v-for="(group, index) in groups" :key="group.key">
    <div
      data-test="rich-text-toolbar-group"
      class="flex items-center gap-1"
      :class="index === 0 ? undefined : 'border-l border-(--app-input-divider-color) pl-1'"
    >
      <RichTextToolbarControl
        v-for="control in group.controls"
        :key="control.type === 'button' ? control.command.key : control.key"
        :control="control"
        :editor="editor"
        :disabled="disabled"
      />
    </div>
  </template>
</template>
