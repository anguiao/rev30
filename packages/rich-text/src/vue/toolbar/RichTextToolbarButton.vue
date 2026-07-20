<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { runRichTextAction } from '../../editor/action'
import { isRichTextActionDisabled, type RichTextToolbarItem } from '../toolbar'

const props = withDefaults(
  defineProps<{
    item: RichTextToolbarItem
    editor: Editor
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const editor = props.editor

const isDisabled = computed(
  () => props.disabled || isRichTextActionDisabled(props.item.action, editor),
)
const isActive = computed(() => props.item.action.isActive?.(editor) ?? false)

const buttonType = computed(() => (isActive.value ? 'primary' : 'default'))

function handleClick() {
  if (isDisabled.value) {
    return
  }

  runRichTextAction(editor, props.item.action)
}
</script>

<template>
  <NButton
    :data-test="`rich-text-${item.action.key}`"
    :data-active="isActive ? 'true' : undefined"
    :disabled="isDisabled"
    size="small"
    style="--n-padding: 0 6px"
    :type="buttonType"
    :secondary="isActive"
    :quaternary="!isActive"
    :title="item.label"
    :aria-label="item.label"
    :aria-pressed="item.action.isActive ? isActive : undefined"
    @click="handleClick"
  >
    <span :class="item.icon" aria-hidden="true" />
  </NButton>
</template>
