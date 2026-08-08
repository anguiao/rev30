<script setup lang="ts">
import type { BubbleMenuPluginProps } from '@tiptap/extension-bubble-menu'
import { PluginKey, type Transaction } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
} from 'vue'
import type { RichTextQuickBarConfig } from '.'
import { useRichTextRovingFocus } from '../interactions/focus'
import { resolveRichTextQuickBar, type RichTextQuickBarMatch } from './resolve'
import RichTextTextQuickBar from './RichTextTextQuickBar.vue'

const props = defineProps<{
  editor: Editor
  quickBar: RichTextQuickBarConfig
  appendTo: HTMLElement
  scrollContainer: HTMLElement
}>()

const editor = props.editor
const root = useTemplateRef<HTMLElement>('root')
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

function dismissQuickBar() {
  editor.view.focus()
  isDismissed.value = true
  hideBubbleMenu()
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

const rovingFocus = useRichTextRovingFocus(root)

function handleEditorTab(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.key !== 'Tab' || event.shiftKey) {
    return
  }

  if (activeQuickBar.value === null) {
    return
  }

  const entered = rovingFocus.focusEntry()

  if (!entered) {
    return
  }

  event.preventDefault()
}

function handleQuickBarKeydown(event: KeyboardEvent) {
  rovingFocus.handleKeydown(event)

  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.key !== 'Escape' ||
    !rovingFocus.containsItem(event.target)
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  dismissQuickBar()
}

function handleFocusOut(event: FocusEvent) {
  const target = event.relatedTarget

  if (isInsideQuickBar(target) || (target instanceof Node && editor.view.dom.contains(target))) {
    return
  }

  hideBubbleMenu()
}

function handleEditorFocus() {
  isDismissed.value = false
}

function restoreQuickBarOnEditorChange({ transaction }: { transaction: Transaction }) {
  if (transaction.selectionSet || transaction.docChanged) {
    isDismissed.value = false
  }
}

editor.on('focus', handleEditorFocus)
editor.on('transaction', restoreQuickBarOnEditorChange)

onBeforeUnmount(() => {
  editor.off('focus', handleEditorFocus)
  editor.off('transaction', restoreQuickBarOnEditorChange)
})

useEventListener(() => editor.view.dom, 'keydown', handleEditorTab)
useEventListener(() => editor.view.dom, 'focusout', handleFocusOut)

useResizeObserver(root, () => {
  editor.commands.setMeta(quickBarPluginKey, 'updatePosition')
})

onMounted(() => {
  void nextTick(() => {
    // Tiptap sets the BubbleMenu root tabindex to 0 when registering its plugin.
    if (root.value?.parentElement) {
      root.value.parentElement.tabIndex = -1
    }
  })
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
  >
    <div
      ref="root"
      data-rich-text-toolbar-root
      data-test="rich-text-quick-bar"
      class="pointer-events-auto flex items-center gap-1 rounded-(--rich-text-theme-border-radius) border border-(--rich-text-theme-input-border-color) bg-(--rich-text-theme-popover-color) p-1 shadow-lg"
      role="toolbar"
      aria-label="上下文格式工具栏"
      aria-orientation="horizontal"
      @focusin="rovingFocus.handleFocusIn"
      @focusout="handleFocusOut"
      @keydown="handleQuickBarKeydown"
    >
      <component
        :is="featureQuickBar.component"
        v-if="featureQuickBar"
        v-bind="featureQuickBar.props"
        :editor="editor"
      />

      <RichTextTextQuickBar v-else-if="textControls" :editor="editor" :controls="textControls" />
    </div>
  </BubbleMenu>
</template>
