<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import type { RichTextToolbarItem } from '../core/toolbar'

const props = withDefaults(
  defineProps<{
    item: RichTextToolbarItem
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

  return props.item.isDisabled?.(props.editor) ?? false
})

function handleClick() {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.item.run(props.editor)
}
</script>

<template>
  <NButton
    :data-test="`rich-text-${item.key}`"
    :disabled="isDisabled"
    quaternary
    :title="item.label"
    :aria-label="item.label"
    @click="handleClick"
  >
    <span :class="item.icon" aria-hidden="true" />
  </NButton>
</template>
