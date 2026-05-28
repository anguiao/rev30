<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { computed, toRef } from 'vue'
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

const activeToolbar = computed(() => props.preset.toolbar)
const richTextPreset = computed(() => props.preset.preset)

const { editor } = useRichTextEditor({
  modelValue: toRef(props, 'modelValue'),
  disabled: toRef(props, 'disabled'),
  preset: richTextPreset,
  onUpdate: (value) => emit('update:modelValue', value),
  onBlur: () => emit('blur'),
})
</script>

<template>
  <div
    data-test="rich-text-editor"
    class="w-full overflow-hidden rounded-ui border border-(--app-input-border-color) bg-(--app-input-color) transition-[background-color,border-color,box-shadow] duration-300"
    :class="
      disabled
        ? ''
        : 'focus-within:border-input-focus-border focus-within:bg-(--app-input-color-focus) focus-within:shadow-input-focus hover:border-input-hover-border'
    "
  >
    <div
      v-if="activeToolbar"
      class="flex flex-wrap gap-1 border-b border-(--app-input-divider-color) px-2 py-1"
    >
      <RichTextToolbar :editor="editor" :toolbar="activeToolbar" :disabled="disabled" />
    </div>

    <EditorContent
      :editor="editor"
      class="prose prose-sm flow-root max-w-none dark:prose-invert [&_.ProseMirror]:min-h-(--rich-text-editor-min-height) [&_.ProseMirror]:px-3 [&_.ProseMirror]:outline-none"
      :style="{ '--rich-text-editor-min-height': `${minHeight}px` }"
    />
  </div>
</template>
