<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { RichTextImageAttrs } from '../shared'

interface ImageToolbarControlProps extends RichTextToolbarControlInjectedProps {
  accept?: string
  upload: (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>
  onError?: (error: unknown) => void
}

defineProps<ImageToolbarControlProps>()
</script>

<template>
  <NButton
    data-test="rich-text-image"
    quaternary
    size="small"
    :disabled="disabled || editor === null"
  >
    <span class="i-[lucide--image]" aria-hidden="true" />
  </NButton>
</template>
