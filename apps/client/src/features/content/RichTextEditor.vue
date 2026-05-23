<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { NButton, NButtonGroup } from 'naive-ui'
import type { TiptapDocument } from '@rev30/shared'

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

function toggleLink() {
  if (editor.value === undefined) {
    return
  }

  const chain = editor.value.chain().focus().extendMarkRange('link')

  if (editor.value.isActive('link')) {
    chain.unsetLink().run()
    return
  }

  chain.setLink({ href: 'https://example.com' }).run()
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
    class="overflow-hidden rounded-ui border border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
  >
    <div class="flex flex-wrap gap-1 border-b border-stone-200 p-2 dark:border-zinc-800">
      <NButtonGroup size="small">
        <NButton
          data-test="rich-text-bold"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleBold().run()"
        >
          <span class="i-[lucide--bold]" />
        </NButton>
        <NButton
          data-test="rich-text-italic"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleItalic().run()"
        >
          <span class="i-[lucide--italic]" />
        </NButton>
        <NButton
          data-test="rich-text-underline"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleUnderline().run()"
        >
          <span class="i-[lucide--underline]" />
        </NButton>
      </NButtonGroup>

      <NButtonGroup size="small">
        <NButton data-test="rich-text-heading-1" :disabled="disabled" @click="setHeading(1)">
          <span class="i-[lucide--heading-1]" />
        </NButton>
        <NButton data-test="rich-text-heading-2" :disabled="disabled" @click="setHeading(2)">
          <span class="i-[lucide--heading-2]" />
        </NButton>
        <NButton
          data-test="rich-text-blockquote"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleBlockquote().run()"
        >
          <span class="i-[lucide--quote]" />
        </NButton>
      </NButtonGroup>

      <NButtonGroup size="small">
        <NButton
          data-test="rich-text-bullet-list"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleBulletList().run()"
        >
          <span class="i-[lucide--list]" />
        </NButton>
        <NButton
          data-test="rich-text-ordered-list"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleOrderedList().run()"
        >
          <span class="i-[lucide--list-ordered]" />
        </NButton>
        <NButton data-test="rich-text-link" :disabled="disabled" @click="toggleLink">
          <span class="i-[lucide--link]" />
        </NButton>
      </NButtonGroup>

      <NButtonGroup size="small">
        <NButton
          data-test="rich-text-horizontal-rule"
          :disabled="disabled"
          @click="editor?.chain().focus().setHorizontalRule().run()"
        >
          <span class="i-[lucide--minus]" />
        </NButton>
        <NButton
          data-test="rich-text-undo"
          :disabled="disabled"
          @click="editor?.chain().focus().undo().run()"
        >
          <span class="i-[lucide--undo-2]" />
        </NButton>
        <NButton
          data-test="rich-text-redo"
          :disabled="disabled"
          @click="editor?.chain().focus().redo().run()"
        >
          <span class="i-[lucide--redo-2]" />
        </NButton>
      </NButtonGroup>
    </div>

    <EditorContent
      :editor="editor"
      class="prose dark:prose-invert max-w-none p-3"
      :style="{ minHeight: `${minHeight}px` }"
    />
  </div>
</template>
