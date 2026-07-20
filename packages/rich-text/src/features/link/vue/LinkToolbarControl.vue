<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { RichTextSurfaceCloseReason } from '../../../vue/surface-coordinator'
import { useRichTextToolbarLayer } from '../../../vue/surface-coordinator'
import { NButton, NPopover } from 'naive-ui'
import { computed, ref } from 'vue'
import { resolveRichTextLinkTarget } from '../target'
import LinkEditorForm from './LinkEditorForm.vue'
import { useRichTextLinkEditor } from './useLinkEditor'

const props = withDefaults(defineProps<RichTextToolbarControlInjectedProps>(), {
  disabled: false,
})

const editor = props.editor
const showPopover = ref(false)
let toolbarLayer: ReturnType<typeof useRichTextToolbarLayer> | undefined

const linkEditor = useRichTextLinkEditor({
  editor,
  disabled: () => props.disabled,
  onClose() {
    showPopover.value = false
    toolbarLayer?.release()
  },
})

function closePopover(reason: RichTextSurfaceCloseReason) {
  if (reason === 'cancel') {
    linkEditor.cancel()
    return
  }

  linkEditor.close(reason)
}

toolbarLayer = useRichTextToolbarLayer(editor, closePopover)

const isActive = computed(() => editor.isActive('link'))
const isDisabled = computed(
  () => props.disabled || resolveRichTextLinkTarget(editor, 'toolbar') === null,
)

function togglePopover() {
  if (isDisabled.value) {
    return
  }

  if (linkEditor.isOpen.value) {
    closePopover('cancel')
    return
  }

  if (!linkEditor.open('toolbar')) {
    return
  }

  toolbarLayer?.claim()
  showPopover.value = true
}
</script>

<template>
  <NPopover
    :show="showPopover"
    trigger="manual"
    placement="bottom"
    :disabled="isDisabled"
    @clickoutside="closePopover('outside')"
  >
    <template #trigger>
      <NButton
        data-test="rich-text-link"
        :data-active="isActive ? 'true' : undefined"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActive ? 'primary' : 'default'"
        :secondary="isActive"
        :quaternary="!isActive"
        title="链接"
        aria-label="链接"
        :aria-pressed="isActive"
        aria-haspopup="dialog"
        :aria-expanded="showPopover"
        @mousedown.prevent
        @click="togglePopover"
      >
        <span class="i-[lucide--link]" aria-hidden="true" />
      </NButton>
    </template>

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
      @cancel="closePopover('cancel')"
    />
  </NPopover>
</template>
