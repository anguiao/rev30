<script setup lang="ts">
import { canRunRichTextAction, runRichTextAction } from '../../../editor/action'
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import { NButton, NButtonGroup } from 'naive-ui'
import { computed } from 'vue'
import { codeBlockAction } from '../editor'
import CodeBlockLanguageControl from './CodeBlockLanguageControl.vue'

interface CodeBlockToolbarControlProps extends RichTextToolbarControlProps {
  languages: readonly {
    readonly label: string
    readonly value: string
  }[]
}

const props = withDefaults(defineProps<CodeBlockToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const isActive = computed(() => editor.isActive('codeBlock'))
const isDisabled = computed(() => props.disabled || !canRunRichTextAction(editor, codeBlockAction))

function toggleCodeBlock() {
  if (!isDisabled.value) {
    runRichTextAction(editor, codeBlockAction)
  }
}
</script>

<template>
  <NButtonGroup size="small">
    <NButton
      data-test="rich-text-code-block"
      :data-active="isActive ? 'true' : undefined"
      :disabled="isDisabled"
      style="--n-padding: 0 6px"
      :type="isActive ? 'primary' : 'default'"
      :secondary="isActive"
      :quaternary="!isActive"
      title="代码块"
      aria-label="代码块"
      :aria-pressed="isActive"
      @click="toggleCodeBlock"
    >
      <span class="i-[lucide--square-code]" aria-hidden="true" />
    </NButton>

    <CodeBlockLanguageControl
      :editor="editor"
      :languages="languages"
      :disabled="disabled"
      surface="toolbar"
    />
  </NButtonGroup>
</template>
