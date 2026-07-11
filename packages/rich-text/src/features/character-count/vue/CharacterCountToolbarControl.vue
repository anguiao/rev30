<script setup lang="ts">
import type { EditorEvents } from '@tiptap/core'
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<RichTextToolbarControlInjectedProps>(), {
  disabled: false,
})

const characterCount = ref(0)
const isUnavailable = computed(() => props.disabled || !props.editor)

function updateCharacterCount() {
  characterCount.value = props.editor?.storage.characterCount.characters() ?? 0
}

function handleTransaction({ transaction, appendedTransactions }: EditorEvents['transaction']) {
  if (!transaction.docChanged && !appendedTransactions.some(({ docChanged }) => docChanged)) {
    return
  }

  updateCharacterCount()
}

watch(
  () => props.editor,
  (editor, previousEditor) => {
    previousEditor?.off('transaction', handleTransaction)
    editor?.on('transaction', handleTransaction)
    updateCharacterCount()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  props.editor?.off('transaction', handleTransaction)
})
</script>

<template>
  <div
    data-test="rich-text-character-count"
    class="text-text-3 inline-flex h-7 shrink-0 items-center gap-1 px-1.5 text-xs"
    :class="{ 'opacity-50': isUnavailable }"
    :title="`字符数：${characterCount}`"
    :aria-label="`字符数：${characterCount}`"
    :aria-disabled="isUnavailable"
    aria-live="polite"
  >
    <span class="i-[lucide--letter-text]" aria-hidden="true" />
    <span>{{ characterCount }} 字</span>
  </div>
</template>
