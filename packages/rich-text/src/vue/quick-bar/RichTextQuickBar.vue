<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { BubbleMenuPluginProps } from '@tiptap/extension-bubble-menu'
import { PluginKey, type Transaction } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { RichTextQuickBarConfig } from '.'
import { resolveRichTextQuickBar, type RichTextQuickBarMatch } from './resolve'
import RichTextQuickBarControls from './RichTextQuickBarControls.vue'

const props = defineProps<{
  editor: Editor
  quickBar: RichTextQuickBarConfig
  appendTo: HTMLElement
  scrollContainer: HTMLElement
}>()

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const rovingItemSelector =
  '[data-rich-text-quick-bar-roving]:not(:disabled):not([disabled]):not([aria-disabled="true"])'
const isDismissed = ref(false)

const quickBarPluginKey = new PluginKey('richTextQuickBar')
const activeQuickBar = shallowRef<RichTextQuickBarMatch | null>(null)

const featureQuickBar = computed(() =>
  activeQuickBar.value?.type === 'feature' ? activeQuickBar.value.quickBar : null,
)
const textControls = computed(() =>
  activeQuickBar.value?.type === 'text' ? activeQuickBar.value.controls : null,
)

const menuOptions = {
  placement: 'top',
  offset: ({ rects }) => ({
    mainAxis: 4,
    crossAxis:
      featureQuickBar.value?.anchorAlignment === 'end'
        ? (rects.reference.width - rects.floating.width) / 2
        : 0,
  }),
  flip: true,
  scrollTarget: props.scrollContainer,
  onHide: () => {
    activeQuickBar.value = null
  },
} satisfies NonNullable<BubbleMenuPluginProps['options']>

function hideBubbleMenu() {
  editor.commands.setMeta(quickBarPluginKey, 'hide')
}

function updateBubbleMenuPosition() {
  editor.commands.setMeta(quickBarPluginKey, 'updatePosition')
}

function isInsideQuickBar(target: EventTarget | null) {
  return target instanceof Node && root.value?.contains(target) === true
}

function shouldShowQuickBar() {
  const hasFocus = editor.isFocused || isInsideQuickBar(document.activeElement)

  activeQuickBar.value =
    !isDismissed.value && hasFocus ? resolveRichTextQuickBar(editor, props.quickBar) : null
  return activeQuickBar.value !== null
}

function getAnchorElement() {
  return featureQuickBar.value?.getAnchorElement?.(editor) ?? null
}

function getRovingItems() {
  return Array.from(root.value?.querySelectorAll<HTMLElement>(rovingItemSelector) ?? [])
}

function setTabbableItem(item: HTMLElement) {
  for (const candidate of getRovingItems()) {
    candidate.tabIndex = candidate === item ? 0 : -1
  }
}

function syncRovingTabIndex() {
  const items = getRovingItems()
  const item = items.find((candidate) => candidate.tabIndex === 0) ?? items[0]

  if (item) {
    setTabbableItem(item)
  }
}

function handleEditorTab(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.key !== 'Tab' || event.shiftKey) {
    return
  }

  if (activeQuickBar.value === null) {
    return
  }

  const items = getRovingItems()
  const item = items.find((candidate) => candidate.dataset.active === 'true') ?? items[0]

  if (!item) {
    return
  }

  item.focus()
  event.preventDefault()
}

function handleEditorFocus() {
  isDismissed.value = false
}

function handleQuickBarKeydown(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    editor.view.focus()
    isDismissed.value = true
    hideBubbleMenu()
    return
  }

  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    const items = getRovingItems()
    const currentIndex = items.indexOf(event.target as HTMLElement)

    if (currentIndex >= 0) {
      event.preventDefault()
      event.stopPropagation()

      let nextIndex: number

      if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = items.length - 1
      } else {
        const offset = event.key === 'ArrowRight' ? 1 : -1
        nextIndex = (currentIndex + offset + items.length) % items.length
      }

      items[nextIndex]!.focus()
    }

    return
  }
}

function handleQuickBarFocusIn(event: FocusEvent) {
  const target = event.target

  if (target instanceof HTMLElement && target.matches(rovingItemSelector)) {
    setTabbableItem(target)
  }
}

function handleFocusOut(event: FocusEvent) {
  const target = event.relatedTarget

  if (isInsideQuickBar(target) || (target instanceof Node && editor.view.dom.contains(target))) {
    return
  }

  hideBubbleMenu()
}

function handleEditorTransaction({ transaction }: { transaction: Transaction }) {
  if (transaction.selectionSet || transaction.docChanged) {
    isDismissed.value = false
  }
}

editor.on('focus', handleEditorFocus)
editor.on('transaction', handleEditorTransaction)

watch(
  activeQuickBar,
  (quickBar) => {
    if (quickBar) {
      syncRovingTabIndex()
      updateBubbleMenuPosition()
    }
  },
  { flush: 'post' },
)

onMounted(() => {
  editor.view.dom.addEventListener('keydown', handleEditorTab)
  editor.view.dom.addEventListener('focusout', handleFocusOut)

  void nextTick(() => {
    // Tiptap sets the BubbleMenu root tabindex to 0 when registering its plugin.
    if (root.value?.parentElement) {
      root.value.parentElement.tabIndex = -1
    }
  })
})

onBeforeUnmount(() => {
  if (!editor.isDestroyed) {
    editor.view.dom.removeEventListener('keydown', handleEditorTab)
    editor.view.dom.removeEventListener('focusout', handleFocusOut)
  }

  editor.off('focus', handleEditorFocus)
  editor.off('transaction', handleEditorTransaction)
})
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :plugin-key="quickBarPluginKey"
    :append-to="appendTo"
    :options="menuOptions"
    :should-show="shouldShowQuickBar"
    :get-referenced-virtual-element="getAnchorElement"
    :update-delay="0"
  >
    <div
      ref="root"
      data-test="rich-text-quick-bar"
      class="pointer-events-auto flex items-center gap-1 rounded-(--rich-text-theme-border-radius) border border-(--rich-text-theme-input-border-color) bg-(--rich-text-theme-popover-color) p-1 shadow-lg"
      role="toolbar"
      aria-label="上下文格式工具栏"
      @focusin="handleQuickBarFocusIn"
      @focusout="handleFocusOut"
      @keydown="handleQuickBarKeydown"
    >
      <component
        :is="featureQuickBar.component"
        v-if="featureQuickBar"
        v-bind="featureQuickBar.props"
        :editor="editor"
        @close="updateBubbleMenuPosition"
        @suspend="hideBubbleMenu"
      />

      <RichTextQuickBarControls
        v-else-if="textControls"
        :editor="editor"
        :controls="textControls"
        @close="updateBubbleMenuPosition"
      />
    </div>
  </BubbleMenu>
</template>
