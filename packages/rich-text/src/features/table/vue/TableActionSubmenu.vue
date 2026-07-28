<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { computed, nextTick, ref } from 'vue'
import {
  canRunRichTextAction,
  runRichTextAction,
  type RichTextActionItem,
} from '../../../editor/action'
import { focusRichTextMenuItem, handleRichTextMenuKeydown } from '../../../vue/interactions/focus'

const props = defineProps<{
  editor: Editor
  triggerLabel: string
  triggerIcon: string
  triggerTest: string
  menuLabel: string
  items: readonly RichTextActionItem[]
  disabled?: boolean
  rovingItemKey?: string
  onClose: () => void
}>()

const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const show = ref(false)

const editor = props.editor

function isItemDisabled(item: RichTextActionItem) {
  return props.disabled === true || !canRunRichTextAction(editor, item.action)
}

function close() {
  show.value = false
}

function open(entry: 'active' | 'last' = 'active') {
  show.value = true
  void nextTick(() => focusRichTextMenuItem(menu.value, entry))
}

function run(item: RichTextActionItem) {
  if (isItemDisabled(item)) {
    return
  }

  if (runRichTextAction(editor, item.action)) {
    close()
    props.onClose()
  }
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    props.disabled ||
    !['ArrowDown', 'ArrowUp'].includes(event.key)
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  open(event.key === 'ArrowUp' ? 'last' : 'active')
}

function handleMenuKeydown(event: KeyboardEvent) {
  handleRichTextMenuKeydown(event, {
    trigger:
      root.value?.querySelector<HTMLElement>('[data-rich-text-table-submenu-trigger]') ?? null,
    close,
  })
}

function handleTab(event: KeyboardEvent) {
  if (event.defaultPrevented || event.key !== 'Tab') {
    return
  }

  queueMicrotask(close)
}

defineExpose({ close, open })
</script>

<template>
  <div ref="root" class="relative contents">
    <button
      type="button"
      role="menuitem"
      data-rich-text-table-submenu-trigger
      :data-rich-text-toolbar-item="rovingItemKey"
      :data-test="triggerTest"
      :disabled="disabled"
      :aria-disabled="disabled ? 'true' : undefined"
      aria-haspopup="menu"
      :aria-expanded="show"
      class="flex min-h-9 w-full items-center justify-between gap-4 rounded-(--rich-text-theme-border-radius) px-2 py-1.5 text-left text-sm hover:bg-(--rich-text-theme-primary-muted-color) disabled:cursor-not-allowed disabled:opacity-50"
      :title="triggerLabel"
      @click="show ? close() : open()"
      @keydown="handleTriggerKeydown"
    >
      <span class="flex items-center gap-2">
        <span :class="[triggerIcon, 'size-4']" aria-hidden="true" />
        <span>{{ triggerLabel }}</span>
      </span>
      <span class="i-[lucide--chevron-right] size-4" aria-hidden="true" />
    </button>

    <div
      v-if="show"
      ref="menu"
      class="absolute top-0 left-full z-20 min-w-44 rounded-(--rich-text-theme-border-radius) border border-(--rich-text-theme-input-border-color) bg-(--rich-text-theme-popover-color) p-1 shadow-lg"
      role="menu"
      :aria-label="menuLabel"
      @keydown="handleMenuKeydown"
      @keydown.capture="handleTab"
    >
      <button
        v-for="item in items"
        :key="item.action.key"
        type="button"
        role="menuitem"
        :data-test="`rich-text-table-menu-${item.action.key}`"
        :data-active="item.action.isActive?.(editor) ? 'true' : undefined"
        :disabled="isItemDisabled(item)"
        :aria-disabled="isItemDisabled(item) ? 'true' : undefined"
        class="flex min-h-9 w-full items-center gap-2 rounded-(--rich-text-theme-border-radius) px-2 py-1.5 text-left text-sm hover:bg-(--rich-text-theme-primary-muted-color) disabled:cursor-not-allowed disabled:opacity-50"
        @click="run(item)"
      >
        <span :class="[item.icon, 'size-4']" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>
