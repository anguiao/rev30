<script setup lang="ts">
import { useMutationObserver, useResizeObserver } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { runRichTextAction } from '../../../editor/action'
import { resolveElementPath, selectElementPathItemAction, type ElementPathItem } from '../editor'
import type { RichTextStatusBarItemInjectedProps } from '../../../vue/status-bar'
import { useRichTextRovingFocus } from '../../../vue/interactions/focus'

const props = defineProps<RichTextStatusBarItemInjectedProps>()

const editor = props.editor
const root = useTemplateRef<HTMLElement>('root')
const path = computed(() => resolveElementPath(editor.state))
const isEditable = ref(editor.isEditable)

// `setEditable(..., false)` updates ProseMirror's contenteditable attribute without
// changing the reactive editor state. Observe that boundary so the path controls
// become disabled without manufacturing a content transaction.
useMutationObserver(
  () => editor.view.dom,
  () => {
    isEditable.value = editor.isEditable
  },
  {
    attributes: true,
    attributeFilter: ['contenteditable'],
  },
)

const rovingFocus = useRichTextRovingFocus(root)

function scrollCurrentPathItem() {
  const container = root.value
  if (!container) {
    return
  }

  const pathItemSelector = '[data-rich-text-toolbar-item]'
  const activeElement = document.activeElement
  const focusedItem =
    activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>(pathItemSelector)
      : null
  const item =
    focusedItem && container.contains(focusedItem)
      ? focusedItem
      : Array.from(container.querySelectorAll<HTMLElement>(pathItemSelector)).at(-1)

  if (!item) {
    return
  }

  const containerRect = container.getBoundingClientRect()
  const itemRect = item.getBoundingClientRect()

  if (itemRect.left < containerRect.left) {
    container.scrollLeft -= containerRect.left - itemRect.left
  } else if (itemRect.right > containerRect.right) {
    container.scrollLeft += itemRect.right - containerRect.right
  }
}

function handlePathFocusIn(event: FocusEvent) {
  rovingFocus.handleFocusIn(event)
  scrollCurrentPathItem()
}

function handlePathKeydown(event: KeyboardEvent) {
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
  editor.view.focus()
}

function handlePathItemClick(item: ElementPathItem) {
  if (!isEditable.value || !editor.isEditable) {
    return
  }

  runRichTextAction(editor, selectElementPathItemAction, item)
}

watch([root, path], scrollCurrentPathItem, { flush: 'post' })
useResizeObserver(root, scrollCurrentPathItem)
</script>

<template>
  <div
    ref="root"
    data-test="rich-text-element-path"
    data-rich-text-toolbar-root
    class="flex max-w-full min-w-0 flex-1 items-center gap-1 overflow-x-auto"
    @focusin="handlePathFocusIn"
    @keydown="handlePathKeydown"
  >
    <template v-for="(item, index) in path" :key="item.key">
      <span v-if="index > 0" aria-hidden="true">&gt;</span>
      <button
        type="button"
        :data-rich-text-toolbar-item="item.key"
        :data-test="`rich-text-element-path-${item.key}`"
        :aria-label="`选择 ${item.tag} 元素`"
        :disabled="!isEditable"
        :tabindex="isEditable && index === path.length - 1 ? 0 : -1"
        class="shrink-0 rounded px-1 py-0.5 outline-none focus-visible:ring-1 focus-visible:ring-(--rich-text-theme-input-border-focus-color) enabled:hover:bg-(--rich-text-theme-primary-muted-color) disabled:cursor-default disabled:opacity-60"
        @click="handlePathItemClick(item)"
      >
        {{ item.tag }}
      </button>
    </template>
  </div>
</template>
