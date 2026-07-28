<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  canRunRichTextAction,
  runRichTextAction,
  type RichTextActionItem,
} from '../../../editor/action'
import {
  addColumnAfterAction,
  addColumnAfterActionItem,
  addColumnBeforeAction,
  addColumnBeforeActionItem,
  addRowAfterAction,
  addRowAfterActionItem,
  addRowBeforeAction,
  addRowBeforeActionItem,
  deleteColumnAction,
  deleteColumnActionItem,
  deleteRowAction,
  deleteRowActionItem,
  deleteTableAction,
  deleteTableActionItem,
  toggleHeaderRowAction,
  toggleHeaderRowActionItem,
} from '../editor'
import { focusRichTextMenuItem, handleRichTextMenuKeydown } from '../../../vue/interactions/focus'
import TableActionSubmenu from './TableActionSubmenu.vue'

const props = defineProps<{
  editor: Editor
  trigger: HTMLElement | null
  onClose: () => void
  onEscape?: () => void
}>()

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const version = ref(0)

const rowItems = [addRowBeforeActionItem, addRowAfterActionItem, deleteRowActionItem] as const
const columnItems = [
  addColumnBeforeActionItem,
  addColumnAfterActionItem,
  deleteColumnActionItem,
] as const

const headerActive = computed(() => {
  void version.value
  return toggleHeaderRowAction.isActive?.(editor) ?? false
})
const headerDisabled = computed(() => {
  void version.value
  return !canRunRichTextAction(editor, toggleHeaderRowAction)
})
const deleteTableDisabled = computed(() => {
  void version.value
  return !canRunRichTextAction(editor, deleteTableAction)
})

function isItemDisabled(item: RichTextActionItem) {
  void version.value
  return !canRunRichTextAction(editor, item.action)
}

function run(item: RichTextActionItem) {
  if (isItemDisabled(item)) {
    return
  }

  if (runRichTextAction(editor, item.action)) {
    props.onClose()
  }
}

function handleMenuKeydown(event: KeyboardEvent) {
  handleRichTextMenuKeydown(event, {
    trigger: props.trigger,
    close: () => {
      if (props.onEscape) {
        props.onEscape()
      } else {
        props.onClose()
      }
    },
  })
}

onMounted(() => {
  version.value += 1
  void nextTick(() => focusRichTextMenuItem(root.value, 'active'))
  editor.on('transaction', sync)
})

function sync() {
  version.value += 1
}

function stop() {
  editor.off('transaction', sync)
}

defineExpose({ root })

onUnmounted(stop)
</script>

<template>
  <div
    ref="root"
    class="min-w-52 rounded-(--rich-text-theme-border-radius) p-1"
    role="menu"
    aria-label="表格操作"
    @keydown="handleMenuKeydown"
  >
    <TableActionSubmenu
      :editor="editor"
      trigger-label="行"
      trigger-icon="i-[lucide--rows-3]"
      trigger-test="rich-text-table-rows"
      menu-label="行操作"
      :items="rowItems"
      :on-close="props.onClose"
    />
    <TableActionSubmenu
      :editor="editor"
      trigger-label="列"
      trigger-icon="i-[lucide--columns-3]"
      trigger-test="rich-text-table-columns"
      menu-label="列操作"
      :items="columnItems"
      :on-close="props.onClose"
    />
    <button
      type="button"
      role="menuitemcheckbox"
      data-test="rich-text-table-toggle-header-row"
      :data-active="headerActive ? 'true' : undefined"
      :disabled="headerDisabled"
      :aria-disabled="headerDisabled ? 'true' : undefined"
      :aria-checked="headerActive"
      class="flex min-h-9 w-full items-center gap-2 rounded-(--rich-text-theme-border-radius) px-2 py-1.5 text-left text-sm hover:bg-(--rich-text-theme-primary-muted-color) disabled:cursor-not-allowed disabled:opacity-50"
      @click="run(toggleHeaderRowActionItem)"
    >
      <span :class="[toggleHeaderRowActionItem.icon, 'size-4']" aria-hidden="true" />
      <span>{{ toggleHeaderRowActionItem.label }}</span>
    </button>
    <button
      type="button"
      role="menuitem"
      data-test="rich-text-table-delete"
      :disabled="deleteTableDisabled"
      :aria-disabled="deleteTableDisabled ? 'true' : undefined"
      class="flex min-h-9 w-full items-center gap-2 rounded-(--rich-text-theme-border-radius) px-2 py-1.5 text-left text-sm text-(--rich-text-theme-error-color) hover:bg-(--rich-text-theme-error-color-hover) disabled:cursor-not-allowed disabled:opacity-50"
      @click="run(deleteTableActionItem)"
    >
      <span :class="[deleteTableActionItem.icon, 'size-4']" aria-hidden="true" />
      <span>{{ deleteTableActionItem.label }}</span>
    </button>
  </div>
</template>
