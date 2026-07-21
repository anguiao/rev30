<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { NButton } from 'naive-ui'
import { computed, ref } from 'vue'
import {
  type RichTextOverlayCloseReason,
  useRichTextToolbarOverlay,
} from '../../../vue/overlay-state'
import { getRichTextQuickbarLayerId } from '../../../vue/quickbar'
import { resolveRichTextLinkTarget, type RichTextLinkTargetSurface } from '../target'
import LinkEditorPopover from './LinkEditorPopover.vue'
import { useRichTextLinkEditor } from './useLinkEditor'

type LinkControlSurface = Extract<RichTextLinkTargetSurface, 'text-quickbar' | 'toolbar'>

const props = withDefaults(
  defineProps<{
    editor: Editor
    surface: LinkControlSurface
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const layerId = getRichTextQuickbarLayerId(editor)
const toolbarOverlay = useRichTextToolbarOverlay(close)
const linkEditor = useRichTextLinkEditor({
  editor,
  disabled: () => props.disabled,
  onClose() {
    if (props.surface === 'toolbar') {
      toolbarOverlay.close()
    }
  },
})
const isDisabled = computed(
  () =>
    props.disabled ||
    (!linkEditor.isOpen.value && resolveRichTextLinkTarget(editor, props.surface) === null),
)
const dataTest = computed(() =>
  props.surface === 'toolbar' ? 'rich-text-link' : 'rich-text-quickbar-link',
)

function toggleEditor() {
  if (linkEditor.isOpen.value) {
    close('cancel')
    return
  }

  if (isDisabled.value || !linkEditor.open(props.surface)) {
    return
  }

  if (props.surface === 'toolbar') {
    toolbarOverlay.open()
  }
}

function close(reason: RichTextOverlayCloseReason = 'outside') {
  if (reason === 'cancel') {
    linkEditor.cancel()
    return
  }

  linkEditor.close(reason)
}

function focusInitialControl() {
  const control = root.value?.querySelector<HTMLElement>('button:not(:disabled)')
  control?.focus()
  return control !== null && control !== undefined
}

defineExpose({ close, focusInitialControl })
</script>

<template>
  <div ref="root" class="contents">
    <LinkEditorPopover
      v-model="linkEditor.draft.value"
      :show="linkEditor.isOpen.value"
      show-open
      :to="toolbarOverlay.target.value"
      :disabled="isDisabled"
      :invalid="linkEditor.isInvalid.value"
      :can-apply="linkEditor.canApply.value"
      :can-open="linkEditor.canOpen.value"
      :can-remove="linkEditor.canRemove.value"
      :quickbar-layer-id="surface === 'text-quickbar' ? layerId : undefined"
      @apply="linkEditor.apply"
      @open="linkEditor.openDraft"
      @remove="linkEditor.remove"
      @close="close"
    >
      <template #trigger>
        <NButton
          :data-test="dataTest"
          :data-rich-text-quickbar-roving="surface === 'text-quickbar' ? '' : undefined"
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
          aria-haspopup="dialog"
          :aria-expanded="linkEditor.isOpen.value"
          @mousedown.prevent
          @click="toggleEditor"
        >
          <span class="i-[lucide--link]" aria-hidden="true" />
        </NButton>
      </template>
    </LinkEditorPopover>
  </div>
</template>
