<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NInput } from 'naive-ui'
import { computed, ref } from 'vue'
import { runRichTextAction } from '../../../editor/action'
import { setLinkAction, unsetLinkAction } from '../editor'
import { normalizeLinkHref } from '../href'
import type { LinkRange } from '../range'

const props = withDefaults(
  defineProps<{
    editor: Editor
    range: LinkRange
    autofocus?: boolean
    disabled?: boolean
  }>(),
  {
    autofocus: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  close: []
}>()

const editor = props.editor

const href = ref(props.range.href)
const normalizedHref = computed(() => normalizeLinkHref(href.value))

// An empty value removes the link; a non-empty value must normalize to a valid URL.
const isValid = computed(() => href.value.trim() === '' || normalizedHref.value !== '')

const hasLink = computed(() => {
  const linkType = editor.schema.marks.link
  return (
    linkType !== undefined &&
    editor.state.doc.rangeHasMark(props.range.from, props.range.to, linkType)
  )
})

function handleApply() {
  if (normalizedHref.value) {
    runRichTextAction(editor, setLinkAction, normalizedHref.value, props.range)
  } else {
    runRichTextAction(editor, unsetLinkAction, props.range)
  }

  emit('close')
}

function openLink() {
  window.open(normalizedHref.value, '_blank', 'noopener,noreferrer')
}

function removeLink() {
  runRichTextAction(editor, unsetLinkAction, props.range)
  emit('close')
}

function cancel() {
  editor.commands.focus()
  emit('close')
}

function handleInputEnter(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter' || props.disabled || !isValid.value) {
    return
  }

  event.preventDefault()
  handleApply()
}

function handleEscape(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  cancel()
}
</script>

<template>
  <div class="flex items-center gap-1" role="group" aria-label="编辑链接" @keydown="handleEscape">
    <NInput
      v-model:value="href"
      data-test="rich-text-link-url"
      size="small"
      placeholder="https://example.com"
      :autofocus="autofocus"
      :disabled="disabled"
      v-bind="!isValid ? { status: 'error' as const } : {}"
      class="mr-1 w-56!"
      aria-label="链接地址"
      @keydown="handleInputEnter"
    >
      <template #suffix>
        <NButton
          data-test="rich-text-link-apply"
          text
          :disabled="disabled || !isValid"
          title="应用链接"
          aria-label="应用链接"
          @mousedown.prevent
          @click="handleApply"
        >
          <span class="i-[lucide--corner-down-left]" aria-hidden="true" />
        </NButton>
      </template>
    </NInput>

    <NButton
      data-test="rich-text-link-open"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      :disabled="normalizedHref === ''"
      title="新窗口打开链接"
      aria-label="新窗口打开链接"
      @mousedown.prevent
      @click="openLink"
    >
      <span class="i-[lucide--external-link]" aria-hidden="true" />
    </NButton>

    <NButton
      v-if="hasLink"
      data-test="rich-text-link-remove"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      :disabled="disabled"
      title="移除链接"
      aria-label="移除链接"
      @mousedown.prevent
      @click="removeLink"
    >
      <span class="i-[lucide--unlink]" aria-hidden="true" />
    </NButton>

    <NButton
      data-test="rich-text-link-cancel"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="取消"
      aria-label="取消编辑链接"
      @mousedown.prevent
      @click="cancel"
    >
      <span class="i-[lucide--x]" aria-hidden="true" />
    </NButton>
  </div>
</template>
