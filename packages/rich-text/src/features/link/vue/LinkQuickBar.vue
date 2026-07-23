<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { NButton } from 'naive-ui'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  type RichTextOverlayCloseReason,
  useRichTextOverlayState,
} from '../../../vue/overlay-state'
import { getRichTextQuickBarLayerId } from '../../../vue/quick-bar'
import { normalizeLinkHref } from '../href'
import { resolveRichTextLinkTarget, type RichTextLinkTarget } from '../target'
import LinkEditorPopover from './LinkEditorPopover.vue'
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

const emit = defineEmits<{
  close: [reason: RichTextOverlayCloseReason]
}>()

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const layerId = getRichTextQuickBarLayerId(editor)
const overlayState = useRichTextOverlayState()
const readonlyTarget = shallowRef<RichTextLinkTarget | null>(null)
const linkEditor = useRichTextLinkEditor({
  editor,
  disabled: () => props.disabled,
  onClose(reason) {
    if (reason === 'invalidated') {
      emit('close', reason)
      return
    }

    if (reason === 'success' || reason === 'cancel') {
      syncReadonlyTarget()
    }
  },
})

function syncReadonlyTarget() {
  if (linkEditor.isOpen.value) {
    return
  }

  readonlyTarget.value = props.disabled ? null : resolveRichTextLinkTarget(editor, 'quick-bar')
}

function editLink() {
  if (linkEditor.isOpen.value) {
    close('cancel')
    return
  }

  const target = readonlyTarget.value

  if (target) {
    linkEditor.openTarget(target)
  }
}

function openReadonlyLink() {
  const href = normalizeLinkHref(readonlyTarget.value?.href ?? '')
  if (!href || props.disabled) {
    return
  }

  window.open(href, '_blank', 'noopener,noreferrer')
}

function removeReadonlyLink() {
  const target = readonlyTarget.value
  if (!target || !linkEditor.openTarget(target)) {
    return
  }

  linkEditor.remove()
}

function close(reason: RichTextOverlayCloseReason = 'outside') {
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

function handleTransaction() {
  syncReadonlyTarget()
}

onMounted(() => {
  syncReadonlyTarget()
  editor.on('transaction', handleTransaction)
})

onBeforeUnmount(() => {
  editor.off('transaction', handleTransaction)
})

defineExpose({ close, focusInitialControl })
</script>

<template>
  <div ref="root" class="flex items-center gap-1">
    <template v-if="readonlyTarget">
      <span
        data-test="rich-text-link-readonly-url"
        class="max-w-64 truncate px-2 text-sm"
        :title="readonlyTarget.href"
      >
        {{ readonlyTarget.href }}
      </span>

      <LinkEditorPopover
        v-model="linkEditor.draft.value"
        :show="linkEditor.isOpen.value"
        :show-open="false"
        :to="overlayState.target.value"
        :disabled="disabled"
        :invalid="linkEditor.isInvalid.value"
        :can-apply="linkEditor.canApply.value"
        :quick-bar-layer-id="layerId"
        @apply="linkEditor.apply"
        @close="close"
      >
        <template #trigger>
          <NButton
            data-test="rich-text-link-edit"
            data-rich-text-quick-bar-roving
            size="small"
            style="--n-padding: 0 6px"
            quaternary
            :disabled="disabled"
            title="编辑链接"
            aria-label="编辑链接"
            aria-haspopup="dialog"
            :aria-expanded="linkEditor.isOpen.value"
            @mousedown.prevent
            @click="editLink"
          >
            <span class="i-[lucide--pencil]" aria-hidden="true" />
          </NButton>
        </template>
      </LinkEditorPopover>

      <NButton
        data-test="rich-text-link-open"
        data-rich-text-quick-bar-roving
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        :disabled="disabled"
        title="新窗口打开链接"
        aria-label="新窗口打开链接"
        @mousedown.prevent
        @click="openReadonlyLink"
      >
        <span class="i-[lucide--external-link]" aria-hidden="true" />
      </NButton>

      <NButton
        data-test="rich-text-link-remove"
        data-rich-text-quick-bar-roving
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        :disabled="disabled"
        title="移除链接"
        aria-label="移除链接"
        @mousedown.prevent
        @click="removeReadonlyLink"
      >
        <span class="i-[lucide--unlink]" aria-hidden="true" />
      </NButton>
    </template>
  </div>
</template>
