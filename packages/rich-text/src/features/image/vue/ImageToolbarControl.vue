<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import { useRichTextToolbarLayer } from '../../../vue/surface-coordinator'
import { NButton } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import {
  getRichTextImageDialogController,
  resolveRichTextImageToolbarTarget,
  type RichTextImageDialogOptions,
  type RichTextImageDialogSession,
} from './dialog-controller'
import ImageDialogHost from './ImageDialogHost.vue'

interface ImageToolbarControlProps
  extends RichTextToolbarControlInjectedProps, RichTextImageDialogOptions {}

const props = withDefaults(defineProps<ImageToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const controller = getRichTextImageDialogController(editor)
const openedSession = ref<RichTextImageDialogSession | null>(null)
const target = computed(() => resolveRichTextImageToolbarTarget(editor))
const isActive = computed(() => target.value?.type === 'edit')
const isDisabled = computed(() => props.disabled || target.value === null)
const buttonLabel = computed(() => (isActive.value ? '编辑图片' : '图片'))

function closeToolbarDialog() {
  const activeSession = openedSession.value

  if (activeSession) {
    controller.close(activeSession)
    openedSession.value = null
  }

  toolbarLayer.release()
}

const toolbarLayer = useRichTextToolbarLayer(editor, closeToolbarDialog)

function openDialog() {
  const currentTarget = target.value

  if (isDisabled.value || !currentTarget) {
    return
  }

  toolbarLayer.claim()
  openedSession.value = controller.open('toolbar', currentTarget, {
    upload: props.upload,
    ...(props.onError ? { onError: props.onError } : {}),
  })
}

watch(controller.session, (activeSession) => {
  if (openedSession.value && activeSession !== openedSession.value) {
    openedSession.value = null
    toolbarLayer.release()
  }
})

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closeToolbarDialog()
    }
  },
)
</script>

<template>
  <div class="contents">
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
      @mousedown.prevent
      @click="openDialog"
    >
      <span class="i-[lucide--image]" aria-hidden="true" />
    </NButton>

    <ImageDialogHost :editor="editor" :disabled="disabled" />
  </div>
</template>
