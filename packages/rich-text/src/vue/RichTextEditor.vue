<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { ref, toRef } from 'vue'
import type { RichTextDocument } from '../schema'
import { provideRichTextOverlayState } from './overlay-state'
import type { RichTextEditorPreset } from './presets/types'
import RichTextQuickBar from './quick-bar/RichTextQuickBar.vue'
import RichTextStatusBar from './status-bar/RichTextStatusBar.vue'
import { useRichTextThemeStyle } from './theme'
import RichTextToolbar from './toolbar/RichTextToolbar.vue'
import { useRichTextEditor } from './useRichTextEditor'

const props = withDefaults(
  defineProps<{
    modelValue: RichTextDocument
    /** Initialization-only editor configuration. Runtime replacement is not supported. */
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

const initialPreset = props.preset
const activeToolbar = initialPreset.toolbar
const activeStatusBar = initialPreset.statusBar
const activeQuickBar = initialPreset.quickBar
const activeSlashCommand = initialPreset.slashCommand
const root = ref<HTMLElement | null>(null)
const scrollTarget = ref<HTMLElement | null>(null)
const overlayHost = ref<HTMLElement | null>(null)
provideRichTextOverlayState(overlayHost)
const richTextThemeStyle = useRichTextThemeStyle()

const { editor } = useRichTextEditor({
  modelValue: toRef(props, 'modelValue'),
  disabled: toRef(props, 'disabled'),
  initialPreset,
  onUpdate: (value) => emit('update:modelValue', value),
})

function handleFocusout(event: FocusEvent) {
  const nextTarget = event.relatedTarget

  if (nextTarget instanceof Node && root.value?.contains(nextTarget)) {
    return
  }

  emit('blur')
}
</script>

<template>
  <div
    ref="root"
    data-test="rich-text-editor"
    class="rich-text-theme relative flex w-full flex-col overflow-visible rounded-(--rich-text-theme-border-radius) border border-(--rich-text-theme-input-border-color) bg-(--rich-text-theme-input-color) transition-[background-color,border-color,box-shadow] duration-300"
    :class="
      disabled
        ? undefined
        : 'focus-within:border-(--rich-text-theme-input-border-focus-color) focus-within:bg-(--rich-text-theme-input-focus-color) focus-within:shadow-(--rich-text-theme-input-box-shadow-focus) hover:border-(--rich-text-theme-input-border-hover-color)'
    "
    :style="richTextThemeStyle"
    @focusout="handleFocusout"
  >
    <RichTextToolbar
      v-if="activeToolbar"
      data-test="rich-text-toolbar"
      :editor="editor"
      :toolbar="activeToolbar"
      :disabled="disabled"
    />

    <div ref="scrollTarget" class="relative min-h-0 flex-1 overflow-y-auto">
      <EditorContent
        :editor="editor"
        class="prose prose-sm h-full max-w-none dark:prose-invert"
        :style="{ '--rich-text-editor-min-height': `${minHeight}px` }"
      />

      <RichTextQuickBar
        v-if="activeQuickBar && overlayHost && scrollTarget && !disabled"
        :editor="editor"
        :quick-bar="activeQuickBar"
        :append-to="overlayHost"
        :scroll-container="scrollTarget"
      />

      <component
        :is="activeSlashCommand.component"
        v-if="activeSlashCommand?.component && overlayHost"
        :editor="editor"
        :config="activeSlashCommand"
        :append-to="overlayHost"
        :disabled="disabled"
      />
    </div>

    <div
      ref="overlayHost"
      data-test="rich-text-overlay-host"
      class="pointer-events-none absolute inset-0"
    />

    <component
      :is="initialPreset.host"
      v-if="initialPreset.host"
      :editor="editor"
      :disabled="disabled"
    />

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
  min-height: max(100%, var(--rich-text-editor-min-height));
  padding: 0.75rem;
  outline: none;
}

:deep(.ProseMirror > :first-child) {
  margin-top: 0;
}

:deep(.ProseMirror > :last-child) {
  margin-bottom: 0;
}

:deep(.ProseMirror ::selection) {
  background-color: var(--rich-text-theme-selection-color);
}

:deep(.ProseMirror .rich-text-slash-command-placeholder::before) {
  float: left;
  height: 0;
  content: attr(data-placeholder);
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}

:deep(.ProseMirror .selection) {
  background-color: var(--rich-text-theme-selection-color);
  box-decoration-break: clone;
  box-shadow:
    0 -0.2em 0 var(--rich-text-theme-selection-color),
    0 0.2em 0 var(--rich-text-theme-selection-color);
  -webkit-box-decoration-break: clone;
}

:deep(.ProseMirror img.ProseMirror-selectednode) {
  border-radius: var(--rich-text-theme-border-radius);
  outline: 1px solid var(--rich-text-theme-primary-color-hover);
  outline-offset: 2px;
}
</style>
