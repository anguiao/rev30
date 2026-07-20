<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { HighlightColorOption } from '../colors'
import HighlightColorControl from './HighlightColorControl.vue'

interface HighlightToolbarControlProps extends RichTextToolbarControlInjectedProps {
  colors: readonly HighlightColorOption[]
}

withDefaults(defineProps<HighlightToolbarControlProps>(), {
  disabled: false,
})
</script>

<template>
  <HighlightColorControl :editor="editor" :colors="colors" :disabled="disabled" surface="toolbar" />
</template>
