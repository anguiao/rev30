<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { onClickOutside } from '@vueuse/core'
import { NButton } from 'naive-ui'
import { computed, nextTick, ref } from 'vue'
import type { RichTextSurfaceCloseReason } from '../../../vue/surface-coordinator'
import { resolveRichTextLinkTarget } from '../target'
import LinkEditorForm from './LinkEditorForm.vue'
import { useRichTextLinkEditor } from './useLinkEditor'

const props = withDefaults(
  defineProps<{
    editor: Editor
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const linkEditor = useRichTextLinkEditor({
  editor,
  disabled: () => props.disabled,
  onClose: requestPositionUpdate,
})
const isDisabled = computed(
  () => props.disabled || resolveRichTextLinkTarget(editor, 'text-quickbar') === null,
)

function requestPositionUpdate() {
  void nextTick(() => {
    if (!editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta('richTextQuickbarUpdate', true))
    }
  })
}

function openEditor() {
  if (!isDisabled.value && linkEditor.open('text-quickbar')) {
    requestPositionUpdate()
  }
}

function close(reason: RichTextSurfaceCloseReason = 'outside') {
  if (reason === 'cancel') {
    linkEditor.cancel()
    return
  }

  linkEditor.close(reason)
}

function focusInitialControl() {
  const control = root.value?.querySelector<HTMLElement>('input, button:not(:disabled)')
  control?.focus()
  return control !== null && control !== undefined
}

onClickOutside(root, () => close('outside'))

defineExpose({ close, focusInitialControl })
</script>

<template>
  <div ref="root" class="flex items-center gap-1">
    <LinkEditorForm
      v-if="linkEditor.isOpen.value"
      v-model="linkEditor.draft.value"
      :invalid="linkEditor.isInvalid.value"
      :can-apply="linkEditor.canApply.value"
      :can-open="linkEditor.canOpen.value"
      :can-remove="linkEditor.canRemove.value"
      autofocus
      @apply="linkEditor.apply"
      @open="linkEditor.openDraft"
      @remove="linkEditor.remove"
      @cancel="close('cancel')"
    />

    <NButton
      v-else
      data-test="rich-text-quickbar-link"
      data-rich-text-quickbar-roving
      :data-active="editor.isActive('link') ? 'true' : undefined"
      :disabled="isDisabled"
      size="small"
      style="--n-padding: 0 6px"
      :type="editor.isActive('link') ? 'primary' : 'default'"
      :secondary="editor.isActive('link')"
      :quaternary="!editor.isActive('link')"
      title="链接"
      aria-label="链接"
      :aria-pressed="editor.isActive('link')"
      @mousedown.prevent
      @click="openEditor"
    >
      <span class="i-[lucide--link]" aria-hidden="true" />
    </NButton>
  </div>
</template>
