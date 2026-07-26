<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { getSelectedImageAttrs } from '../editor'

interface ImageToolbarControlProps extends RichTextToolbarControlProps {
  openDialog: (editor: Editor) => void
}

const props = withDefaults(defineProps<ImageToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const isActive = computed(() => getSelectedImageAttrs(editor.state.selection) !== null)
const buttonLabel = computed(() => (isActive.value ? '编辑图片' : '图片'))
</script>

<template>
  <NButton
    data-test="rich-text-image"
    :data-active="isActive ? 'true' : undefined"
    :disabled="disabled"
    size="small"
    style="--n-padding: 0 6px"
    :type="isActive ? 'primary' : 'default'"
    :secondary="isActive"
    :quaternary="!isActive"
    :title="buttonLabel"
    :aria-label="buttonLabel"
    :aria-pressed="isActive"
    @click="openDialog(editor)"
  >
    <span class="i-[lucide--image]" aria-hidden="true" />
  </NButton>
</template>
