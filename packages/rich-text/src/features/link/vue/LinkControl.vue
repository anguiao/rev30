<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { resolveRichTextLinkTarget, type RichTextLinkTargetSurface } from '../target'
import LinkEditorPopover from './LinkEditorPopover.vue'
import { useRichTextLinkEditor } from './useLinkEditor'

type LinkControlSurface = Extract<RichTextLinkTargetSurface, 'text-quick-bar' | 'toolbar'>

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
const linkEditor = useRichTextLinkEditor({
  editor,
  disabled: () => props.disabled,
})
const isDisabled = computed(
  () =>
    props.disabled ||
    (!linkEditor.isOpen.value && resolveRichTextLinkTarget(editor, props.surface) === null),
)
const dataTest = computed(() =>
  props.surface === 'toolbar' ? 'rich-text-link' : 'rich-text-quick-bar-link',
)

function toggleEditor() {
  if (linkEditor.isOpen.value) {
    linkEditor.cancel()
    return
  }

  if (isDisabled.value || !linkEditor.open(props.surface)) {
    return
  }
}

function handleTriggerMousedown(event: MouseEvent) {
  if (props.surface === 'text-quick-bar') {
    event.preventDefault()
  }
}
</script>

<template>
  <div class="contents">
    <LinkEditorPopover
      v-model="linkEditor.draft.value"
      :show="linkEditor.isOpen.value"
      show-open
      :disabled="isDisabled"
      :invalid="linkEditor.isInvalid.value"
      :can-apply="linkEditor.canApply.value"
      :can-open="linkEditor.canOpen.value"
      :can-remove="linkEditor.canRemove.value"
      @apply="linkEditor.apply"
      @open="linkEditor.openDraft"
      @remove="linkEditor.remove"
      @close="linkEditor.close"
      @cancel="linkEditor.cancel"
    >
      <template #trigger>
        <NButton
          :data-test="dataTest"
          :data-rich-text-quick-bar-roving="surface === 'text-quick-bar' ? '' : undefined"
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
          @mousedown="handleTriggerMousedown"
          @click="toggleEditor"
        >
          <span class="i-[lucide--link]" aria-hidden="true" />
        </NButton>
      </template>
    </LinkEditorPopover>
  </div>
</template>
