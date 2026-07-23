<script setup lang="ts">
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import type { HighlightColorOption } from '../colors'
import HighlightColorControl from './HighlightColorControl.vue'

interface HighlightToolbarControlProps extends RichTextToolbarControlProps {
  colors: readonly HighlightColorOption[]
}

withDefaults(defineProps<HighlightToolbarControlProps>(), {
  disabled: false,
})
</script>

<template>
  <HighlightColorControl :editor="editor" :colors="colors" :disabled="disabled" surface="toolbar" />
</template>
