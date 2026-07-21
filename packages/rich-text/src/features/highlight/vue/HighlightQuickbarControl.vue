<script setup lang="ts">
import type { RichTextQuickbarInjectedProps } from '../../../vue/quickbar'
import type { RichTextOverlayCloseReason } from '../../../vue/overlay-state'
import { ref } from 'vue'
import type { HighlightColorOption } from '../colors'
import HighlightColorControl from './HighlightColorControl.vue'

interface HighlightQuickbarControlProps extends RichTextQuickbarInjectedProps {
  colors: readonly HighlightColorOption[]
}

withDefaults(defineProps<HighlightQuickbarControlProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  close: [reason: RichTextOverlayCloseReason]
}>()

const control = ref<InstanceType<typeof HighlightColorControl> | null>(null)

function handleClose(reason: RichTextOverlayCloseReason) {
  if (reason !== 'cancel') {
    emit('close', reason)
  }
}

defineExpose({
  close: (reason: RichTextOverlayCloseReason) => control.value?.close(reason),
  focusInitialControl: () => control.value?.focusInitialControl() ?? false,
})
</script>

<template>
  <HighlightColorControl
    ref="control"
    :editor="editor"
    :colors="colors"
    :disabled="disabled"
    surface="quickbar"
    @close="handleClose"
  />
</template>
