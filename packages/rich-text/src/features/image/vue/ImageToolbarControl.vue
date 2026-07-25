<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { canInsertImage, getSelectedImageAttrs } from '../editor'

interface ImageToolbarControlProps extends RichTextToolbarControlProps {
  openDialog: (editor: Editor) => boolean
}

const props = withDefaults(defineProps<ImageToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const selectedImage = computed(() => getSelectedImageAttrs(editor))
const isActive = computed(() => selectedImage.value !== null)
const isDisabled = computed(() => props.disabled || (!isActive.value && !canInsertImage(editor)))
const buttonLabel = computed(() => (isActive.value ? '编辑图片' : '图片'))

function handleClick() {
  if (isDisabled.value) {
    return
  }

  props.openDialog(editor)
}
</script>

<template>
  <NButton
    data-test="rich-text-image"
    :data-active="isActive ? 'true' : undefined"
    :disabled="isDisabled"
    size="small"
    style="--n-padding: 0 6px"
    :type="isActive ? 'primary' : 'default'"
    :secondary="isActive"
    :quaternary="!isActive"
    :title="buttonLabel"
    :aria-label="buttonLabel"
    :aria-pressed="isActive"
    @click="handleClick"
  >
    <span class="i-[lucide--image]" aria-hidden="true" />
  </NButton>
</template>
