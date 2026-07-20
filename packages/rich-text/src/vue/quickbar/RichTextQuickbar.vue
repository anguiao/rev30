<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  getRichTextQuickbarLayerId,
  richTextQuickbarPluginKey,
  type RichTextQuickbarConfig,
} from '../quickbar'
import {
  captureRichTextSelection,
  restoreRichTextSelection,
  type RichTextSelectionSnapshot,
} from '../selection'
import {
  getRichTextSurfaceCoordinator,
  type RichTextSurfaceCloseReason,
} from '../surface-coordinator'
import { resolveRichTextQuickbarContext, type RichTextQuickbarContext } from './context'
import RichTextQuickbarControls from './RichTextQuickbarControls.vue'

interface QuickbarSurfaceExposed {
  close?: (reason?: RichTextSurfaceCloseReason) => void
  focusInitialControl?: () => boolean
}

const props = withDefaults(
  defineProps<{
    editor: Editor
    quickbar: RichTextQuickbarConfig
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const editor = props.editor
const coordinator = getRichTextSurfaceCoordinator(editor)
const layerId = getRichTextQuickbarLayerId(editor)
const root = ref<HTMLElement | null>(null)
const activeSurface = shallowRef<QuickbarSurfaceExposed | null>(null)
const context = shallowRef<RichTextQuickbarContext | null>(null)
const pinnedSelection = shallowRef<RichTextSelectionSnapshot | null>(null)
const pinnedContext = shallowRef<RichTextQuickbarContext | null>(null)
const dismissedSelection = ref('')
let editorElement: HTMLElement | undefined
let quickbarObserver: MutationObserver | undefined
let isClosingSurface = false

const menuOptions = {
  placement: 'top' as const,
  offset: 8,
  flip: true,
}

function getSelectionSignature() {
  const { selection } = editor.state

  return `${selection.constructor.name}:${selection.from}:${selection.to}`
}

function setActiveSurface(value: unknown) {
  activeSurface.value =
    value && typeof value === 'object' ? (value as QuickbarSurfaceExposed) : null
}

function isFocusInsideQuickbar() {
  const activeElement = document.activeElement

  return (
    activeElement instanceof Element &&
    (root.value?.contains(activeElement) === true ||
      activeElement.closest(`[data-rich-text-quickbar-subinterface="${layerId}"]`) !== null)
  )
}

function releasePinnedContext() {
  pinnedSelection.value = null
  pinnedContext.value = null
}

function requestMenuUpdate() {
  if (!editor.isDestroyed) {
    editor.view.dispatch(editor.state.tr.setMeta('richTextQuickbarUpdate', true))
  }
}

function closeSurface(reason: RichTextSurfaceCloseReason) {
  if (isClosingSurface) {
    return
  }

  isClosingSurface = true
  activeSurface.value?.close?.(reason)

  if (reason === 'cancel') {
    if (pinnedSelection.value) {
      restoreRichTextSelection(editor, pinnedSelection.value)
    } else {
      editor.commands.focus()
    }

    dismissedSelection.value = getSelectionSignature()
  }

  releasePinnedContext()
  requestMenuUpdate()
  isClosingSurface = false
}

function suspendSurface() {
  releasePinnedContext()
  requestMenuUpdate()
}

const unregisterQuickbarCloser = coordinator.registerQuickbarCloser(closeSurface)

function shouldShow() {
  if (props.disabled || coordinator.isQuickbarSuppressed.value) {
    return false
  }

  const nextContext = pinnedContext.value ?? resolveRichTextQuickbarContext(editor, props.quickbar)
  context.value = nextContext

  if (!nextContext || dismissedSelection.value === getSelectionSignature()) {
    return false
  }

  return editor.isFocused || pinnedContext.value !== null || isFocusInsideQuickbar()
}

const activeFeature = computed(() =>
  context.value?.type === 'feature' ? context.value.feature : null,
)

function getRovingButtons() {
  return Array.from(
    root.value?.querySelectorAll<HTMLElement>('[data-rich-text-quickbar-roving]:not(:disabled)') ??
      [],
  )
}

function setRovingButton(button: HTMLElement | null) {
  for (const candidate of getRovingButtons()) {
    candidate.tabIndex = candidate === button ? 0 : -1
  }
}

function syncRovingTabIndex() {
  const buttons = getRovingButtons()
  const current = buttons.find((button) => button.tabIndex === 0)
  setRovingButton(current ?? buttons[0] ?? null)
}

function focusInitialControl() {
  const exposedResult = activeSurface.value?.focusInitialControl?.()

  if (exposedResult !== undefined) {
    const activeElement = document.activeElement

    if (
      activeElement instanceof HTMLElement &&
      activeElement.dataset.richTextQuickbarRoving !== undefined
    ) {
      setRovingButton(activeElement)
    }

    return exposedResult
  }

  const buttons = getRovingButtons()
  const button = buttons.find((candidate) => candidate.dataset.active === 'true') ?? buttons[0]
  setRovingButton(button ?? null)
  button?.focus()
  return button !== null && button !== undefined
}

function pinCurrentContext() {
  const nextContext = resolveRichTextQuickbarContext(editor, props.quickbar)

  if (!nextContext) {
    return false
  }

  pinnedSelection.value = captureRichTextSelection(editor)
  pinnedContext.value = nextContext
  context.value = nextContext
  return true
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.key !== 'Tab' ||
    event.shiftKey ||
    !editor.isFocused ||
    coordinator.isQuickbarSuppressed.value ||
    dismissedSelection.value === getSelectionSignature()
  ) {
    return
  }

  if (!pinCurrentContext() || !focusInitialControl()) {
    releasePinnedContext()
    return
  }

  event.preventDefault()
}

function handleQuickbarFocus(event: FocusEvent) {
  if (!pinnedSelection.value) {
    pinCurrentContext()
  }

  const target = event.target

  if (target instanceof HTMLElement && target.dataset.richTextQuickbarRoving !== undefined) {
    setRovingButton(target)
  }
}

function restorePinnedActionTarget(event: MouseEvent | KeyboardEvent) {
  if (!pinnedSelection.value) {
    return
  }

  if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) {
    return
  }

  const target = event.target

  if (
    target instanceof Element &&
    target.closest('[data-rich-text-quickbar-roving], [data-rich-text-quickbar-action-target]')
  ) {
    restoreRichTextSelection(editor, pinnedSelection.value, false)
  }
}

function handleQuickbarKeydown(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeSurface('cancel')
    return
  }

  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    const buttons = getRovingButtons()
    const currentIndex = buttons.indexOf(event.target as HTMLElement)

    if (currentIndex >= 0 && buttons.length > 0) {
      event.preventDefault()
      event.stopPropagation()

      let nextButton: HTMLElement | undefined

      if (event.key === 'Home') {
        nextButton = buttons[0]
      } else if (event.key === 'End') {
        nextButton = buttons.at(-1)
      } else {
        const offset = event.key === 'ArrowRight' ? 1 : -1
        nextButton = buttons[(currentIndex + offset + buttons.length) % buttons.length]
      }

      setRovingButton(nextButton ?? null)
      nextButton?.focus()
    }

    return
  }

  if (event.key !== 'Tab') {
    return
  }

  void nextTick(() => {
    if (!isFocusInsideQuickbar()) {
      releasePinnedContext()
      requestMenuUpdate()
    }
  })
}

function handleDocumentFocus(event: FocusEvent) {
  if (!pinnedContext.value) {
    return
  }

  const target = event.target

  if (
    target instanceof Element &&
    (root.value?.contains(target) === true ||
      target.closest(`[data-rich-text-quickbar-subinterface="${layerId}"]`) !== null)
  ) {
    return
  }

  if (!(target instanceof Node) || !editor.view.dom.contains(target)) {
    closeSurface('outside')
  }
}

function handleEditorPointerDown() {
  if (pinnedContext.value) {
    closeSurface('outside')
  }
}

function handleTransaction({ transaction }: { transaction: Transaction }) {
  if (transaction.selectionSet || transaction.docChanged) {
    dismissedSelection.value = ''
  }

  if (transaction.docChanged && pinnedContext.value) {
    closeSurface('invalidated')
  }

  void nextTick(syncRovingTabIndex)
}

watch(root, (element) => {
  quickbarObserver?.disconnect()
  quickbarObserver = undefined

  if (element) {
    quickbarObserver = new MutationObserver(() => void nextTick(syncRovingTabIndex))
    quickbarObserver.observe(element, { childList: true, subtree: true })
    void nextTick(syncRovingTabIndex)
  }
})

onMounted(() => {
  editorElement = editor.view.dom
  editorElement.addEventListener('keydown', handleEditorKeydown)
  editorElement.addEventListener('mousedown', handleEditorPointerDown)
  document.addEventListener('focusin', handleDocumentFocus)
  editor.on('transaction', handleTransaction)
})

onBeforeUnmount(() => {
  unregisterQuickbarCloser()
  quickbarObserver?.disconnect()
  quickbarObserver = undefined
  editorElement?.removeEventListener('keydown', handleEditorKeydown)
  editorElement?.removeEventListener('mousedown', handleEditorPointerDown)
  editorElement = undefined
  document.removeEventListener('focusin', handleDocumentFocus)
  editor.off('transaction', handleTransaction)
})
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :plugin-key="richTextQuickbarPluginKey"
    :options="menuOptions"
    :should-show="shouldShow"
    :update-delay="0"
  >
    <div
      ref="root"
      data-test="rich-text-quickbar"
      :data-rich-text-quickbar-subinterface="layerId"
      class="bg-popover flex items-center gap-1 rounded-ui border border-input-border p-1 shadow-lg"
      role="toolbar"
      aria-label="上下文格式工具栏"
      @focusin="handleQuickbarFocus"
      @mousedown.capture="restorePinnedActionTarget"
      @keydown.capture="restorePinnedActionTarget"
      @keydown="handleQuickbarKeydown"
    >
      <component
        :is="activeFeature.component"
        v-if="activeFeature"
        :ref="setActiveSurface"
        v-bind="activeFeature.props"
        :editor="editor"
        :disabled="disabled"
        @close="closeSurface"
        @suspend="suspendSurface"
      />

      <RichTextQuickbarControls
        v-else-if="context?.type === 'text' && quickbar.text"
        :ref="setActiveSurface"
        :editor="editor"
        :controls="quickbar.text"
        :disabled="disabled"
        @close="closeSurface"
      />
    </div>
  </BubbleMenu>
</template>
