<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { NButton, NButtonGroup } from 'naive-ui'
import type { TiptapDocument } from '@rev30/contracts'

const props = withDefaults(
  defineProps<{
    modelValue: TiptapDocument
    disabled?: boolean
    minHeight?: number
  }>(),
  {
    disabled: false,
    minHeight: 240,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: TiptapDocument]
  blur: []
}>()

const editor = shallowRef(
  new Editor({
    content: props.modelValue,
    editable: !props.disabled,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
        },
        underline: {},
      }),
    ],
    onBlur() {
      emit('blur')
    },
    onUpdate({ editor }) {
      emit('update:modelValue', editor.getJSON() as TiptapDocument)
    },
  }),
)

function setHeading(level: 1 | 2) {
  editor.value?.chain().focus().toggleHeading({ level }).run()
}

watch(
  () => props.disabled,
  (disabled) => {
    editor.value?.setEditable(!disabled)
  },
)

watch(
  () => props.modelValue,
  (value) => {
    const currentValue = editor.value?.getJSON()
    if (JSON.stringify(currentValue) === JSON.stringify(value)) {
      return
    }

    editor.value?.commands.setContent(value, { emitUpdate: false })
  },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
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
    <div class="flex flex-wrap gap-1 border-b border-(--app-input-divider-color) px-2 py-1">
      <NButtonGroup size="small">
        <NButton
          data-test="rich-text-bold"
          :disabled="disabled"
          quaternary
          title="加粗"
          aria-label="加粗"
          @click="editor?.chain().focus().toggleBold().run()"
        >
          <span class="i-[lucide--bold]" />
        </NButton>
        <NButton
          data-test="rich-text-italic"
          :disabled="disabled"
          quaternary
          title="斜体"
          aria-label="斜体"
          @click="editor?.chain().focus().toggleItalic().run()"
        >
          <span class="i-[lucide--italic]" />
        </NButton>
        <NButton
          data-test="rich-text-underline"
          :disabled="disabled"
          quaternary
          title="下划线"
          aria-label="下划线"
          @click="editor?.chain().focus().toggleUnderline().run()"
        >
          <span class="i-[lucide--underline]" />
        </NButton>
      </NButtonGroup>

      <NButtonGroup size="small" class="border-l border-(--app-input-divider-color) pl-1">
        <NButton
          data-test="rich-text-heading-1"
          :disabled="disabled"
          quaternary
          title="一级标题"
          aria-label="一级标题"
          @click="setHeading(1)"
        >
          <span class="i-[lucide--heading-1]" />
        </NButton>
        <NButton
          data-test="rich-text-heading-2"
          :disabled="disabled"
          quaternary
          title="二级标题"
          aria-label="二级标题"
          @click="setHeading(2)"
        >
          <span class="i-[lucide--heading-2]" />
        </NButton>
        <NButton
          data-test="rich-text-blockquote"
          :disabled="disabled"
          quaternary
          title="引用"
          aria-label="引用"
          @click="editor?.chain().focus().toggleBlockquote().run()"
        >
          <span class="i-[lucide--quote]" />
        </NButton>
      </NButtonGroup>

      <NButtonGroup size="small" class="border-l border-(--app-input-divider-color) pl-1">
        <NButton
          data-test="rich-text-bullet-list"
          :disabled="disabled"
          quaternary
          title="无序列表"
          aria-label="无序列表"
          @click="editor?.chain().focus().toggleBulletList().run()"
        >
          <span class="i-[lucide--list]" />
        </NButton>
        <NButton
          data-test="rich-text-ordered-list"
          :disabled="disabled"
          quaternary
          title="有序列表"
          aria-label="有序列表"
          @click="editor?.chain().focus().toggleOrderedList().run()"
        >
          <span class="i-[lucide--list-ordered]" />
        </NButton>
      </NButtonGroup>

      <NButtonGroup size="small" class="border-l border-(--app-input-divider-color) pl-1">
        <NButton
          data-test="rich-text-horizontal-rule"
          :disabled="disabled"
          quaternary
          title="分割线"
          aria-label="分割线"
          @click="editor?.chain().focus().setHorizontalRule().run()"
        >
          <span class="i-[lucide--minus]" />
        </NButton>
        <NButton
          data-test="rich-text-undo"
          :disabled="disabled"
          quaternary
          title="撤销"
          aria-label="撤销"
          @click="editor?.chain().focus().undo().run()"
        >
          <span class="i-[lucide--undo-2]" />
        </NButton>
        <NButton
          data-test="rich-text-redo"
          :disabled="disabled"
          quaternary
          title="重做"
          aria-label="重做"
          @click="editor?.chain().focus().redo().run()"
        >
          <span class="i-[lucide--redo-2]" />
        </NButton>
      </NButtonGroup>
    </div>

    <EditorContent
      :editor="editor"
      class="prose prose-sm flow-root max-w-none dark:prose-invert [&_.ProseMirror]:min-h-(--rich-text-editor-min-height) [&_.ProseMirror]:px-3 [&_.ProseMirror]:outline-none"
      :style="{ '--rich-text-editor-min-height': `${minHeight}px` }"
    />
  </div>
</template>
