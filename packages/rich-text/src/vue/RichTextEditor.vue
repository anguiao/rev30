<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { toRef } from 'vue'
import type { RichTextDocument } from '../schema'
import type { RichTextEditorPreset } from './presets/types'
import RichTextQuickbar from './quickbar/RichTextQuickbar.vue'
import RichTextStatusBar from './status-bar/RichTextStatusBar.vue'
import RichTextToolbar from './toolbar/RichTextToolbar.vue'
import { useRichTextEditor } from './useRichTextEditor'

const props = withDefaults(
  defineProps<{
    modelValue: RichTextDocument
    preset: RichTextEditorPreset
    disabled?: boolean
    minHeight?: number
  }>(),
  {
    disabled: false,
    minHeight: 240,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: RichTextDocument]
  blur: []
}>()

const preset = props.preset
const activeToolbar = preset.toolbar
const activeStatusBar = preset.statusBar
const activeQuickbar = preset.quickbar
const activeBlockMenu = preset.blockMenu

const { editor } = useRichTextEditor({
  modelValue: toRef(props, 'modelValue'),
  disabled: toRef(props, 'disabled'),
  preset,
  onUpdate: (value) => emit('update:modelValue', value),
  onBlur: () => emit('blur'),
})
</script>

<template>
  <div
    data-test="rich-text-editor"
    class="flex w-full flex-col overflow-hidden rounded-ui border border-input-border bg-input transition-[background-color,border-color,box-shadow] duration-300"
    :class="
      disabled
        ? ''
        : 'focus-within:border-input-focus-border focus-within:bg-input-focus focus-within:shadow-input-focus hover:border-input-hover-border'
    "
  >
    <RichTextToolbar
      v-if="activeToolbar"
      data-test="rich-text-toolbar"
      :editor="editor"
      :toolbar="activeToolbar"
      :disabled="disabled"
    />

    <div class="relative min-h-0 flex-1 overflow-y-auto">
      <EditorContent
        :editor="editor"
        class="prose prose-sm max-w-none dark:prose-invert"
        :class="activeBlockMenu ? 'rich-text-editor-with-block-menu' : undefined"
        :style="{ '--rich-text-editor-min-height': `${minHeight}px` }"
      />

      <RichTextQuickbar
        v-if="activeQuickbar"
        :editor="editor"
        :quickbar="activeQuickbar"
        :disabled="disabled"
      />

      <component
        :is="activeBlockMenu.component"
        v-if="activeBlockMenu?.component"
        :editor="editor"
        :config="activeBlockMenu"
        :disabled="disabled"
      />
    </div>

    <RichTextStatusBar
      v-if="activeStatusBar"
      data-test="rich-text-status-bar"
      :editor="editor"
      :status-bar="activeStatusBar"
    />
  </div>
</template>

<style scoped>
:deep(.ProseMirror pre.hljs) {
  background-color: light-dark(#f5f5f4, #09090b);
}

:deep(.ProseMirror) {
  --rich-text-selection-color: color-mix(in srgb, var(--app-primary-color) 24%, transparent);
  min-height: var(--rich-text-editor-min-height);
  padding: 0.75rem;
  outline: none;
}

:deep(.rich-text-editor-with-block-menu .ProseMirror) {
  padding-left: 3.5rem;
}

:deep(.ProseMirror > :first-child) {
  margin-top: 0;
}

:deep(.ProseMirror > :last-child) {
  margin-bottom: 0;
}

:deep(.ProseMirror ::selection) {
  background-color: var(--rich-text-selection-color);
}

:deep(.ProseMirror .selection) {
  background-color: var(--rich-text-selection-color);
  box-decoration-break: clone;
  box-shadow:
    0 -0.2em 0 var(--rich-text-selection-color),
    0 0.2em 0 var(--rich-text-selection-color);
  -webkit-box-decoration-break: clone;
}

:deep(.ProseMirror img.ProseMirror-selectednode) {
  border-radius: var(--radius-ui);
  outline: 1px solid var(--color-primary-hover);
  outline-offset: 2px;
}
</style>
