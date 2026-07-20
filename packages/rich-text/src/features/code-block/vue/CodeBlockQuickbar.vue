<script setup lang="ts">
import { canRunRichTextAction } from '../../../editor/action'
import type { RichTextQuickbarInjectedProps } from '../../../vue/quickbar'
import {
  markRichTextSurfaceTransactionCommand,
  restoreRichTextSelectionCommand,
} from '../../../vue/selection'
import type { RichTextSurfaceCloseReason } from '../../../vue/surface-coordinator'
import { NButton } from 'naive-ui'
import { computed, ref } from 'vue'
import { codeBlockAction } from '../editor'
import { resolveRichTextCodeBlockTarget } from '../target'
import CodeBlockLanguageControl from './CodeBlockLanguageControl.vue'

interface CodeBlockQuickbarProps extends RichTextQuickbarInjectedProps {
  languages: readonly {
    readonly label: string
    readonly value: string
  }[]
}

const props = withDefaults(defineProps<CodeBlockQuickbarProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  close: [reason: RichTextSurfaceCloseReason]
}>()

const editor = props.editor
const owner = Symbol('rich-text-code-block-quickbar')
const root = ref<HTMLElement | null>(null)
const languageControl = ref<InstanceType<typeof CodeBlockLanguageControl> | null>(null)
const target = computed(() => resolveRichTextCodeBlockTarget(editor))
const isConvertDisabled = computed(
  () => props.disabled || !target.value || !canRunRichTextAction(editor, codeBlockAction),
)

function convertToParagraph() {
  const currentTarget = target.value

  if (!currentTarget || isConvertDisabled.value) {
    return
  }

  const handled = editor
    .chain()
    .command(restoreRichTextSelectionCommand(currentTarget.selection))
    .command(markRichTextSurfaceTransactionCommand(owner))
    .command(codeBlockAction.command())
    .command(restoreRichTextSelectionCommand(currentTarget.selection))
    .focus()
    .run()

  if (handled) {
    emit('close', 'outside')
  }
}

function close(reason: RichTextSurfaceCloseReason) {
  languageControl.value?.close(reason)
}

function handleLanguageClose(reason: RichTextSurfaceCloseReason) {
  if (reason !== 'cancel') {
    emit('close', reason)
  }
}

defineExpose({
  close,
  focusInitialControl: () => {
    const button = root.value?.querySelector<HTMLElement>(
      '[data-test="rich-text-quickbar-code-block-language"]',
    )
    button?.focus()
    return button !== null
  },
})
</script>

<template>
  <div ref="root" class="flex items-center gap-1">
    <CodeBlockLanguageControl
      ref="languageControl"
      :editor="editor"
      :languages="languages"
      :disabled="disabled"
      surface="quickbar"
      show-label
      @close="handleLanguageClose"
    />

    <NButton
      data-test="rich-text-quickbar-code-block-paragraph"
      data-rich-text-quickbar-roving
      :disabled="isConvertDisabled"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="转为正文"
      aria-label="转为正文"
      @mousedown.prevent
      @click="convertToParagraph"
    >
      <span class="i-[lucide--pilcrow]" aria-hidden="true" />
    </NButton>
  </div>
</template>
