<script setup lang="ts">
import type { RichTextStatusBarItemInjectedProps } from '../../../../client/vue/status-bar'
import { countSelectedRichTextGraphemes } from '../editor'
import { computed } from 'vue'

const props = defineProps<RichTextStatusBarItemInjectedProps>()

const editor = props.editor
const totalCharacterCount = computed(() => editor.storage.characterCount.characters())
const selectedCharacterCount = computed(() => {
  if (editor.state.selection.empty) {
    return null
  }

  return countSelectedRichTextGraphemes(editor)
})
const characterCountLabel = computed(() => {
  if (selectedCharacterCount.value === null) {
    return `${totalCharacterCount.value} 字`
  }

  return `已选 ${selectedCharacterCount.value} / 共 ${totalCharacterCount.value} 字`
})
const characterCountDescription = computed(() => {
  if (selectedCharacterCount.value === null) {
    return `字符数：${totalCharacterCount.value}`
  }

  return `字符数：已选 ${selectedCharacterCount.value}，共 ${totalCharacterCount.value}`
})
</script>

<template>
  <span
    data-test="rich-text-character-count"
    :title="characterCountDescription"
    :aria-label="characterCountDescription"
    aria-live="polite"
  >
    {{ characterCountLabel }}
  </span>
</template>
