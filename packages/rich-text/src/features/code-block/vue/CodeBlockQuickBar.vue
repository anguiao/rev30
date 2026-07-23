<script setup lang="ts">
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import type { RichTextOverlayCloseReason } from '../../../vue/overlay-state'
import { ref } from 'vue'
import CodeBlockLanguageControl from './CodeBlockLanguageControl.vue'

interface CodeBlockQuickBarProps extends RichTextQuickBarComponentProps {
  languages: readonly {
    readonly label: string
    readonly value: string
  }[]
}

const props = withDefaults(defineProps<CodeBlockQuickBarProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  close: [reason: RichTextOverlayCloseReason]
}>()

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const languageControl = ref<InstanceType<typeof CodeBlockLanguageControl> | null>(null)

function close(reason: RichTextOverlayCloseReason) {
  languageControl.value?.close(reason)
}

function handleLanguageClose(reason: RichTextOverlayCloseReason) {
  if (reason !== 'cancel') {
    emit('close', reason)
  }
}

defineExpose({
  close,
  focusInitialControl: () => {
    const button = root.value?.querySelector<HTMLElement>(
      '[data-test="rich-text-quick-bar-code-block-language"]',
    )
    button?.focus()
    return button !== null
  },
})
</script>

<template>
  <div ref="root" class="contents">
    <CodeBlockLanguageControl
      ref="languageControl"
      :editor="editor"
      :languages="languages"
      :disabled="disabled"
      surface="quick-bar"
      show-label
      @close="handleLanguageClose"
    />
  </div>
</template>
