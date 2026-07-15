<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { toRef } from 'vue'
import type { RichTextDocument } from '../schema'
import type { RichTextEditorPreset } from './presets/types'
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
    class="w-full overflow-hidden rounded-ui border border-input-border bg-input transition-[background-color,border-color,box-shadow] duration-300"
    :class="
      disabled
        ? ''
        : 'focus-within:border-input-focus-border focus-within:bg-input-focus focus-within:shadow-input-focus hover:border-input-hover-border'
    "
  >
    <div v-if="activeToolbar" class="flex flex-wrap gap-1 border-b border-input-divider px-2 py-1">
      <RichTextToolbar :editor="editor" :toolbar="activeToolbar" :disabled="disabled" />
    </div>

    <EditorContent
      :editor="editor"
      class="prose prose-sm flow-root max-w-none dark:prose-invert [&_.ProseMirror]:min-h-(--rich-text-editor-min-height) [&_.ProseMirror]:px-3 [&_.ProseMirror]:outline-none"
      :style="{ '--rich-text-editor-min-height': `${minHeight}px` }"
    />
  </div>
</template>

<style scoped>
:deep(.ProseMirror pre.hljs) {
  background-color: light-dark(#f5f5f4, #09090b);
}

:deep(.ProseMirror) {
  --rich-text-selection-color: color-mix(in srgb, var(--app-primary-color) 24%, transparent);
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

:deep(.ProseMirror .tableWrapper) {
  overflow-x: auto;
}

:deep(.ProseMirror .selectedCell) {
  position: relative;
}

:deep(.ProseMirror .selectedCell::after) {
  position: absolute;
  inset: 0;
  z-index: 2;
  background-color: var(--rich-text-selection-color);
  content: '';
  pointer-events: none;
}

:deep(.ProseMirror img.ProseMirror-selectednode) {
  border-radius: var(--radius-ui);
  outline: 1px solid var(--color-primary-hover);
  outline-offset: 2px;
}
</style>
