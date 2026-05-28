<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import type { RichTextCommand } from '../toolbar'

const props = withDefaults(
  defineProps<{
    command: RichTextCommand
    editor: Editor | null
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const isDisabled = computed(() => {
  if (props.disabled || !props.editor) {
    return true
  }

  return props.command.isDisabled?.(props.editor) ?? false
})

const isActive = computed(() => {
  if (!props.editor) {
    return false
  }

  return props.command.isActive?.(props.editor) ?? false
})

const buttonType = computed(() => (isActive.value ? 'primary' : 'default'))

function handleClick() {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.command.run(props.editor)
}
</script>

<template>
  <NButton
    :data-test="`rich-text-${command.key}`"
    :data-active="isActive ? 'true' : undefined"
    :disabled="isDisabled"
    size="small"
    style="--n-padding: 0 6px"
    :type="buttonType"
    :secondary="isActive"
    :quaternary="!isActive"
    :title="command.label"
    :aria-label="command.label"
    :aria-pressed="command.isActive ? isActive : undefined"
    @click="handleClick"
  >
    <span :class="command.icon" aria-hidden="true" />
  </NButton>
</template>
