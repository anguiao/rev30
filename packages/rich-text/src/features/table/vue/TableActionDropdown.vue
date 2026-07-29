<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NDropdown } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { runRichTextAction, type RichTextActionItem } from '../../../editor/action'
import { focusRichTextMenuItem, handleRichTextMenuKeydown } from '../../../vue/interactions/focus'
import {
  createTableDropdownOptions,
  findTableActionItem,
  getTableDropdownNodeProps,
} from './dropdown'

const props = withDefaults(
  defineProps<{
    editor: Editor
    items: readonly RichTextActionItem[]
    triggerLabel: string
    triggerIcon: string
    triggerTest: string
    rovingItemKey: string
    disabled?: boolean
    placement?: 'bottom-start' | 'bottom-end'
  }>(),
  {
    disabled: false,
    placement: 'bottom-start',
  },
)

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const show = ref(false)
const version = ref(0)
let closeOnFocusout = false
let selectSucceeded: boolean | null = null
let focusTimer: ReturnType<typeof setTimeout> | undefined
let pendingFocus: 'active' | 'last' | undefined

const options = computed(() => {
  void version.value
  return createTableDropdownOptions(editor, props.items, props.disabled)
})
const isDisabled = computed(
  () => props.disabled || options.value.every((option) => option.disabled),
)

function getTrigger() {
  return (
    root.value?.querySelector<HTMLElement>(
      `[data-rich-text-toolbar-item="${props.rovingItemKey}"]`,
    ) ?? null
  )
}

function close() {
  clearTimeout(focusTimer)
  focusTimer = undefined
  pendingFocus = undefined
  closeOnFocusout = false
  show.value = false
}

function focusMenu(entry: 'active' | 'last') {
  clearTimeout(focusTimer)
  pendingFocus = entry
  void nextTick(() => {
    if (!show.value || pendingFocus !== entry) {
      return
    }

    focusTimer = setTimeout(() => {
      if (show.value && pendingFocus === entry) {
        focusRichTextMenuItem(root.value, entry)
      }
    })
  })
}

function handleShow(nextShow: boolean) {
  if (!nextShow && selectSucceeded === false) {
    selectSucceeded = null
    return
  }

  selectSucceeded = null
  closeOnFocusout = false
  show.value = nextShow

  if (nextShow) {
    focusMenu('active')
  } else {
    clearTimeout(focusTimer)
    focusTimer = undefined
    pendingFocus = undefined
  }
}

function run(key: string | number) {
  const item = findTableActionItem(props.items, key)
  return item ? runRichTextAction(editor, item.action) : false
}

function handleSelect(key: string | number) {
  selectSucceeded = run(key)
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    isDisabled.value ||
    !['ArrowDown', 'ArrowUp'].includes(event.key)
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  show.value = true
  focusMenu(event.key === 'ArrowUp' ? 'last' : 'active')
}

function handleKeydown(event: KeyboardEvent) {
  if (!show.value || event.defaultPrevented || event.isComposing) {
    return
  }

  if (event.key === 'Tab') {
    closeOnFocusout = true
    return
  }

  const actionItem =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-rich-text-table-action]')
      : null

  if (actionItem && ['Enter', ' '].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()

    if (run(actionItem.dataset.richTextTableAction!)) {
      close()
    }
    return
  }

  handleRichTextMenuKeydown(event, {
    trigger: getTrigger(),
    close,
  })
}

function handleFocusout(event: FocusEvent) {
  if (
    !closeOnFocusout ||
    (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget))
  ) {
    return
  }

  close()
}

function sync() {
  version.value += 1
}

editor.on('transaction', sync)
onBeforeUnmount(() => {
  clearTimeout(focusTimer)
  pendingFocus = undefined
  editor.off('transaction', sync)
})
</script>

<template>
  <div ref="root" class="contents" @keydown="handleKeydown" @focusout="handleFocusout">
    <NDropdown
      trigger="click"
      :placement="placement"
      :show="show"
      :options="options"
      :node-props="getTableDropdownNodeProps"
      :disabled="isDisabled"
      :keyboard="false"
      :to="false"
      :menu-props="
        () => ({
          role: 'menu',
          'aria-label': `${triggerLabel}操作`,
        })
      "
      @update:show="handleShow"
      @select="handleSelect"
    >
      <NButton
        :data-test="triggerTest"
        :data-rich-text-toolbar-item="rovingItemKey"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        :title="triggerLabel"
        :aria-label="`${triggerLabel}操作`"
        aria-haspopup="menu"
        :aria-expanded="show"
        @keydown="handleTriggerKeydown"
      >
        <span :class="[triggerIcon, 'size-4']" aria-hidden="true" />
        <span class="ml-1 text-xs">{{ triggerLabel }}</span>
        <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
