<script setup lang="ts">
import type { RichTextQuickbarInjectedProps } from '../../../vue/quickbar'
import type { RichTextOverlayCloseReason } from '../../../vue/overlay-state'
import { NButton } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import {
  getRichTextImageDialogController,
  resolveRichTextImageQuickbarTarget,
  type RichTextImageDialogOptions,
  type RichTextImageDialogSession,
} from './dialog-controller'

interface ImageQuickbarProps extends RichTextQuickbarInjectedProps, RichTextImageDialogOptions {}

const props = withDefaults(defineProps<ImageQuickbarProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  close: [reason: RichTextOverlayCloseReason]
  suspend: []
}>()

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const controller = getRichTextImageDialogController(editor)
const openedSession = ref<RichTextImageDialogSession | null>(null)
const target = computed(() => resolveRichTextImageQuickbarTarget(editor))
const isDisabled = computed(() => props.disabled || target.value === null)

function openDialog() {
  const currentTarget = target.value

  if (isDisabled.value || !currentTarget) {
    return
  }

  openedSession.value = controller.open(currentTarget, {
    upload: props.upload,
    ...(props.onError ? { onError: props.onError } : {}),
  })
  emit('suspend')
}

function close(reason: RichTextOverlayCloseReason) {
  const activeSession = openedSession.value

  if (!activeSession) {
    return
  }

  controller.close(activeSession)
  openedSession.value = null

  if (reason === 'cancel') {
    editor.commands.setNodeSelection(activeSession.target.selection.from)
    editor.commands.focus()
  }
}

watch(controller.session, (activeSession) => {
  if (openedSession.value && activeSession !== openedSession.value) {
    openedSession.value = null
    emit('close', 'outside')
  }
})

defineExpose({
  close,
  focusInitialControl: () => {
    const button = root.value?.querySelector<HTMLElement>(
      '[data-test="rich-text-quickbar-image-download"]',
    )
    button?.focus()
    return button !== null
  },
})
</script>

<template>
  <div ref="root" class="contents">
    <NButton
      tag="a"
      data-test="rich-text-quickbar-image-download"
      data-rich-text-quickbar-roving
      :href="isDisabled ? undefined : target?.attrs.src"
      download
      :disabled="isDisabled"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="下载图片"
      aria-label="下载图片"
      @mousedown.prevent
    >
      <span class="i-[lucide--download]" aria-hidden="true" />
    </NButton>
    <NButton
      data-test="rich-text-quickbar-image"
      data-rich-text-quickbar-roving
      :disabled="isDisabled"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="编辑图片"
      aria-label="编辑图片"
      @mousedown.prevent
      @click="openDialog"
    >
      <span class="i-[lucide--pencil]" aria-hidden="true" />
    </NButton>
  </div>
</template>
