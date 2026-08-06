<script setup lang="ts">
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { getSelectedImageAttrs, openImagePicker } from '../editor'

const props = withDefaults(defineProps<RichTextToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const isActive = computed(() => getSelectedImageAttrs(editor.state.selection) !== null)
const buttonLabel = computed(() => (isActive.value ? '编辑图片' : '图片'))

function openPicker() {
  openImagePicker(editor)
}
</script>

<template>
  <NButton
    data-test="rich-text-image"
    data-rich-text-toolbar-item="image"
    :disabled="disabled"
    size="small"
    style="--n-padding: 0 6px"
    :type="isActive ? 'primary' : 'default'"
    :secondary="isActive"
    :quaternary="!isActive"
    :title="buttonLabel"
    :aria-label="buttonLabel"
    :aria-pressed="isActive"
    @click="openPicker"
  >
    <span class="i-[lucide--image]" aria-hidden="true" />
  </NButton>
</template>
