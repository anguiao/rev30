<script setup lang="ts">
import { Editor, EditorContent } from '@tiptap/vue-3'
import { nextTick, onUnmounted, useTemplateRef, watch } from 'vue'
import { collectRichTextEditorExtensions } from '../editor/feature'
import type { RichTextDocument } from '../schema'
import type { RichTextEditorPreset } from './presets/types'
import RichTextQuickBar from './quick-bar/RichTextQuickBar.vue'
import RichTextSlashMenu from './slash-menu/RichTextSlashMenu.vue'
import RichTextStatusBar from './status-bar/RichTextStatusBar.vue'
import { useRichTextThemeStyle } from './theme'
import RichTextToolbar from './toolbar/RichTextToolbar.vue'

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

const root = useTemplateRef<HTMLElement>('root')
const richTextThemeStyle = useRichTextThemeStyle()

const scrollContainer = useTemplateRef<HTMLElement>('scrollContainer')

const preset = props.preset
const editor = new Editor({
  content: props.modelValue,
  editable: !props.disabled,
  extensions: collectRichTextEditorExtensions(preset),
  onUpdate({ editor: currentEditor }) {
    emit('update:modelValue', currentEditor.getJSON())
  },
})

onUnmounted(() => editor.destroy())

watch(
  () => props.disabled,
  (disabled) => editor.setEditable(!disabled, false),
)

watch(
  () => props.modelValue,
  (value) => {
    const document = editor.schema.nodeFromJSON(value)

    if (editor.state.doc.eq(document)) {
      return
    }

    editor.commands.setContent(document, { emitUpdate: false })
  },
  { deep: true },
)

async function handleFocusout(event: FocusEvent) {
  let nextTarget = event.relatedTarget
  if (nextTarget === null) {
    await nextTick()
    nextTarget = document.activeElement
  }

  const editorRoot = root.value
  if (editorRoot === null || (nextTarget instanceof Node && editorRoot.contains(nextTarget))) {
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
      v-if="preset.toolbar"
      data-test="rich-text-toolbar"
      :editor="editor"
      :toolbar="preset.toolbar"
      :disabled="disabled"
    />

    <div ref="scrollContainer" class="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
      <EditorContent
        :editor="editor"
        class="prose prose-sm h-full max-w-none dark:prose-invert"
        :style="{ '--rich-text-editor-min-height': `${minHeight}px` }"
      />

      <RichTextQuickBar
        v-if="preset.quickBar && !disabled && root && scrollContainer"
        :editor="editor"
        :quick-bar="preset.quickBar"
        :scroll-container="scrollContainer"
        :append-to="root"
      />

      <RichTextSlashMenu
        v-if="preset.slashMenu && !disabled && root"
        :editor="editor"
        :slash-menu="preset.slashMenu"
        :append-to="root"
      />
    </div>

    <RichTextStatusBar
      v-if="preset.statusBar"
      data-test="rich-text-status-bar"
      :editor="editor"
      :status-bar="preset.statusBar"
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

:deep(.ProseMirror .rich-text-slash-menu-placeholder::before) {
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

:deep(.ProseMirror .tableWrapper) {
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

:deep(.ProseMirror > .tableWrapper:first-child) {
  margin-top: 0;
}

:deep(.ProseMirror > .tableWrapper:last-child) {
  margin-bottom: 0;
}

:deep(.ProseMirror .tableWrapper:focus-visible) {
  outline: 2px solid var(--rich-text-theme-primary-color);
  outline-offset: 2px;
}

:deep(.ProseMirror .tableWrapper > table) {
  margin-top: 0;
  margin-bottom: 0;
  width: 100%;
}

:deep(.ProseMirror .tableWrapper th),
:deep(.ProseMirror .tableWrapper td) {
  position: relative;
}

:deep(.ProseMirror .tableWrapper th > p),
:deep(.ProseMirror .tableWrapper td > p) {
  margin: 0;
}

:deep(.ProseMirror .tableWrapper .selectedCell::after) {
  position: absolute;
  z-index: 0;
  inset: 0;
  background-color: var(--rich-text-theme-selection-color);
  content: '';
  pointer-events: none;
}

:deep(.ProseMirror .tableWrapper .selectedCell > *) {
  position: relative;
  z-index: 1;
}
</style>
