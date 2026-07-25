<script setup lang="ts">
import { NButton } from 'naive-ui'
import { shallowRef, watchEffect } from 'vue'
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import { normalizeLinkHref } from '../href'
import { resolveRichTextLinkTarget, type RichTextLinkTarget } from '../target'
import LinkEditorPopover from './LinkEditorPopover.vue'
import { useRichTextLinkEditor } from './useLinkEditor'

const props = defineProps<RichTextQuickBarComponentProps>()

const editor = props.editor
const readonlyTarget = shallowRef<RichTextLinkTarget | null>(null)
const linkEditor = useRichTextLinkEditor({
  editor,
})

function syncReadonlyTarget() {
  if (linkEditor.isOpen.value) {
    return
  }

  readonlyTarget.value = resolveRichTextLinkTarget(editor, 'quick-bar')
}

function editLink() {
  if (linkEditor.isOpen.value) {
    linkEditor.cancel()
    return
  }

  const target = readonlyTarget.value

  if (target) {
    linkEditor.openTarget(target)
  }
}

function openReadonlyLink() {
  const href = normalizeLinkHref(readonlyTarget.value?.href ?? '')
  if (!href) {
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

watchEffect(syncReadonlyTarget)
</script>

<template>
  <div class="flex items-center gap-1">
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
        :invalid="linkEditor.isInvalid.value"
        :can-apply="linkEditor.canApply.value"
        @apply="linkEditor.apply"
        @close="linkEditor.close"
        @cancel="linkEditor.cancel"
      >
        <template #trigger>
          <NButton
            data-test="rich-text-link-edit"
            data-rich-text-quick-bar-roving
            size="small"
            style="--n-padding: 0 6px"
            quaternary
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
