<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { InputInst } from 'naive-ui'
import { NButton, NInput } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import { runRichTextAction } from '../../../editor/action'
import { setLinkAction, unsetLinkAction } from '../editor'
import { normalizeLinkHref } from '../href'
import type { LinkRange } from '../range'

const props = defineProps<{
  editor: Editor
  range: LinkRange
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
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
  if (!isValid.value) {
    return
  }

  if (normalizedHref.value) {
    runRichTextAction(editor, setLinkAction, normalizedHref.value, props.range)
  } else {
    runRichTextAction(editor, unsetLinkAction, props.range)
  }

  emit('confirm')
}

function removeLink() {
  runRichTextAction(editor, unsetLinkAction, props.range)
  emit('confirm')
}

function handleInputEnter(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter' || !isValid.value) {
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
  emit('cancel')
}

const urlInput = ref<InputInst | null>(null)
onMounted(() => urlInput.value?.focus())
</script>

<template>
  <form
    class="flex items-center gap-1"
    role="dialog"
    aria-label="编辑链接"
    aria-modal="false"
    @submit.prevent="handleApply"
    @keydown="handleEscape"
  >
    <NInput
      ref="urlInput"
      v-model:value="href"
      data-test="rich-text-link-url"
      size="small"
      placeholder="https://example.com"
      v-bind="!isValid ? { status: 'error' as const } : {}"
      class="mr-1 w-56!"
      aria-label="链接地址"
      @keydown="handleInputEnter"
    >
      <template #suffix>
        <NButton
          data-test="rich-text-link-apply"
          text
          :disabled="!isValid"
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
      v-if="hasLink"
      data-test="rich-text-link-remove"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
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
      @click="emit('cancel')"
    >
      <span class="i-[lucide--x]" aria-hidden="true" />
    </NButton>
  </form>
</template>
