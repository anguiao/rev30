<script setup lang="ts">
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import type { HighlightColorOption } from '../colors'
import HighlightColorControl from './HighlightColorControl.vue'

interface HighlightQuickBarControlProps extends RichTextQuickBarComponentProps {
  colors: readonly HighlightColorOption[]
}

defineProps<HighlightQuickBarControlProps>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <HighlightColorControl
    :editor="editor"
    :colors="colors"
    surface="quick-bar"
    @close="emit('close')"
  />
</template>
