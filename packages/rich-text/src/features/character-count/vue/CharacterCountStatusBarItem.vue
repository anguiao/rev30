<script setup lang="ts">
import type { RichTextStatusBarItemInjectedProps } from '../../../vue/status-bar'
import { computed } from 'vue'

const props = defineProps<RichTextStatusBarItemInjectedProps>()

const editor = props.editor
const characterCount = computed(() => editor.storage.characterCount.characters())
</script>

<template>
  <span
    data-test="rich-text-character-count"
    :title="`字符数：${characterCount}`"
    :aria-label="`字符数：${characterCount}`"
    aria-live="polite"
  >
    {{ characterCount }} 字
  </span>
</template>
