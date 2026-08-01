<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { useTemplateRef } from 'vue'
import type { RichTextToolbarConfig } from '.'
import { useRichTextRovingFocus } from '../interactions/focus'
import { toolbarShortcut, useToolbarShortcut } from '../interactions/toolbar/shortcut'
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
const root = useTemplateRef<HTMLElement>('root')

const rovingFocus = useRichTextRovingFocus(root)
useToolbarShortcut(props.editor, rovingFocus.focusEntry, () => !props.disabled)

function handleToolbarKeydown(event: KeyboardEvent) {
  rovingFocus.handleKeydown(event)

  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.key !== 'Escape' ||
    !rovingFocus.containsItem(event.target)
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  props.editor.view.focus()
}
</script>

<template>
  <div
    ref="root"
    data-rich-text-toolbar-root
    class="flex shrink-0 flex-wrap gap-1 border-b border-(--rich-text-theme-input-divider-color) px-2 py-1"
    role="toolbar"
    aria-label="格式工具栏"
    aria-orientation="horizontal"
    :aria-keyshortcuts="disabled ? undefined : toolbarShortcut"
    @focusin="rovingFocus.handleFocusIn"
    @keydown="handleToolbarKeydown"
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
        :key="control.key"
        :control="control"
        :editor="editor"
        :disabled="disabled"
      />
    </div>
  </div>
</template>
