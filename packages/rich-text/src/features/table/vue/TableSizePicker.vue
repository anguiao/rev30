<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { computed, nextTick, ref } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../editor/action'
import {
  focusRichTextPaletteItem,
  handleRichTextPaletteKeydown,
} from '../../../vue/interactions/focus'
import { insertTableAction } from '../editor'
import { TABLE_SIZE_PICKER_MAX_COLUMNS, TABLE_SIZE_PICKER_MAX_ROWS } from '../shared'

const props = defineProps<{
  editor: Editor
  onClose: () => void
  onEscape?: () => void
}>()

const editor = props.editor
const panel = ref<HTMLElement | null>(null)
const rows = ref(1)
const columns = ref(1)

const sizeLabel = computed(() => `${columns.value} 列 × ${rows.value} 行`)

function setSize(nextRows: number, nextColumns: number) {
  rows.value = nextRows
  columns.value = nextColumns
}

function getCellLabel(cellRows: number, cellColumns: number) {
  return `${cellColumns} 列 ${cellRows} 行`
}

function isCellActive(cellRows: number, cellColumns: number) {
  return cellRows === rows.value && cellColumns === columns.value
}

function isCellHighlighted(cellRows: number, cellColumns: number) {
  return cellRows <= rows.value && cellColumns <= columns.value
}

function handleCellFocus(cellRows: number, cellColumns: number) {
  setSize(cellRows, cellColumns)
}

function handleCellEnter(event: KeyboardEvent, cellRows: number, cellColumns: number) {
  if (event.defaultPrevented || event.isComposing || !['Enter', ' '].includes(event.key)) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  setSize(cellRows, cellColumns)
  insert()
}

function handleCellClick(cellRows: number, cellColumns: number) {
  setSize(cellRows, cellColumns)
  insert()
}

function insert() {
  if (!canRunRichTextAction(editor, insertTableAction, rows.value, columns.value)) {
    return
  }

  if (runRichTextAction(editor, insertTableAction, rows.value, columns.value)) {
    props.onClose()
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  if (props.onEscape) {
    props.onEscape()
  } else {
    props.onClose()
  }
}

function handlePanelKeydown(event: KeyboardEvent) {
  handleEscape(event)
  handleRichTextPaletteKeydown(event, {
    root: panel.value,
    columns: TABLE_SIZE_PICKER_MAX_COLUMNS,
  })

  if (!event.defaultPrevented && event.key === 'Tab') {
    queueMicrotask(() => {
      if (props.onEscape) {
        props.onEscape()
      } else {
        props.onClose()
      }
    })
  }
}

function open(entry: 'first' | 'last') {
  setSize(
    entry === 'first' ? 1 : TABLE_SIZE_PICKER_MAX_ROWS,
    entry === 'first' ? 1 : TABLE_SIZE_PICKER_MAX_COLUMNS,
  )
  void nextTick(() => focusRichTextPaletteItem(panel.value, entry))
}

defineExpose({ open })
</script>

<template>
  <div
    ref="panel"
    data-test="rich-text-table-size-picker"
    class="min-w-64 rounded-(--rich-text-theme-border-radius) p-2"
    role="group"
    aria-label="表格尺寸"
    @keydown="handlePanelKeydown"
  >
    <div class="mb-2 flex items-center justify-between gap-3 text-sm">
      <span>插入表格</span>
      <output data-test="rich-text-table-size-label">{{ sizeLabel }}</output>
    </div>
    <div role="grid" aria-label="表格尺寸选择">
      <div v-for="cellRow in TABLE_SIZE_PICKER_MAX_ROWS" :key="cellRow" role="row" class="flex">
        <button
          v-for="cellColumn in TABLE_SIZE_PICKER_MAX_COLUMNS"
          :key="cellColumn"
          type="button"
          role="gridcell"
          data-rich-text-palette-item
          :data-rich-text-table-size="`${cellRow}x${cellColumn}`"
          :data-rich-text-table-size-highlighted="
            isCellHighlighted(cellRow, cellColumn) ? 'true' : undefined
          "
          :data-active="isCellActive(cellRow, cellColumn) ? 'true' : undefined"
          :tabindex="isCellActive(cellRow, cellColumn) ? 0 : -1"
          :aria-label="getCellLabel(cellRow, cellColumn)"
          :aria-selected="isCellActive(cellRow, cellColumn)"
          class="m-px flex size-6 items-center justify-center rounded-sm border border-(--rich-text-theme-input-border-color) text-xs hover:bg-(--rich-text-theme-primary-muted-color)"
          :class="[
            isCellHighlighted(cellRow, cellColumn)
              ? 'bg-(--rich-text-theme-primary-muted-color)'
              : undefined,
            isCellActive(cellRow, cellColumn)
              ? 'text-(--rich-text-theme-primary-color)'
              : undefined,
          ]"
          @focus="handleCellFocus(cellRow, cellColumn)"
          @mouseenter="handleCellFocus(cellRow, cellColumn)"
          @keydown="handleCellEnter($event, cellRow, cellColumn)"
          @click="handleCellClick(cellRow, cellColumn)"
        >
          <span class="sr-only">{{ getCellLabel(cellRow, cellColumn) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
