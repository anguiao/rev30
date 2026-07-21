<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { ref, toRef } from 'vue'
import type { RichTextDocument } from '../schema'
import { provideRichTextOverlayState } from './overlay-state'
import type { RichTextEditorPreset } from './presets/types'
import RichTextQuickbar from './quickbar/RichTextQuickbar.vue'
import RichTextStatusBar from './status-bar/RichTextStatusBar.vue'
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
const activeQuickbar = initialPreset.quickbar
const activeSlashCommand = initialPreset.slashCommand
const root = ref<HTMLElement | null>(null)
const scrollTarget = ref<HTMLElement | null>(null)
const overlayHost = ref<HTMLElement | null>(null)
provideRichTextOverlayState(overlayHost)

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
    class="relative flex w-full flex-col overflow-visible rounded-ui border border-input-border bg-input transition-[background-color,border-color,box-shadow] duration-300"
    :class="
      disabled
        ? ''
        : 'focus-within:border-input-focus-border focus-within:bg-input-focus focus-within:shadow-input-focus hover:border-input-hover-border'
    "
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

      <RichTextQuickbar
        v-if="activeQuickbar && overlayHost && scrollTarget"
        :editor="editor"
        :quickbar="activeQuickbar"
        :append-to="overlayHost"
        :scroll-target="scrollTarget"
        :disabled="disabled"
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
  --rich-text-selection-color: color-mix(in srgb, var(--app-primary-color) 24%, transparent);
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
  background-color: var(--rich-text-selection-color);
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
