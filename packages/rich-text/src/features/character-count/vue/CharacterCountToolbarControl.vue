<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import { computed } from 'vue'

const props = withDefaults(defineProps<RichTextToolbarControlInjectedProps>(), {
  disabled: false,
})

const editor = props.editor
const characterCount = computed(() => editor?.storage.characterCount.characters() ?? 0)
const isUnavailable = computed(() => props.disabled || !editor)
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
