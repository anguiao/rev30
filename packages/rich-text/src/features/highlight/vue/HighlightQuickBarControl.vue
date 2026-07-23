<script setup lang="ts">
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import type { RichTextOverlayCloseReason } from '../../../vue/overlay-state'
import { ref } from 'vue'
import type { HighlightColorOption } from '../colors'
import HighlightColorControl from './HighlightColorControl.vue'

interface HighlightQuickBarControlProps extends RichTextQuickBarComponentProps {
  colors: readonly HighlightColorOption[]
}

withDefaults(defineProps<HighlightQuickBarControlProps>(), {
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
    surface="quick-bar"
    @close="handleClose"
  />
</template>
