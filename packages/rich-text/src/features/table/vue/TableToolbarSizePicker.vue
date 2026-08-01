<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { ref, useTemplateRef } from 'vue'
import { runRichTextAction } from '../../../editor/action'
import { handleRichTextGridKeydown } from '../../../vue/interactions/focus'
import { insertTableAction } from '../editor'

const MAX_ROWS = 8
const MAX_COLUMNS = 8

const props = defineProps<{ editor: Editor }>()
const emit = defineEmits<{
  close: []
  cancel: []
}>()

const editor = props.editor
const panel = useTemplateRef<HTMLElement>('panel')
const rows = ref(1)
const columns = ref(1)

function setSize(nextRows: number, nextColumns: number) {
  rows.value = nextRows
  columns.value = nextColumns
}

function isCellActive(cellRows: number, cellColumns: number) {
  return cellRows === rows.value && cellColumns === columns.value
}

function isCellHighlighted(cellRows: number, cellColumns: number) {
  return cellRows <= rows.value && cellColumns <= columns.value
}

function insertTable(cellRows: number, cellColumns: number) {
  runRichTextAction(editor, insertTableAction, cellRows, cellColumns)
  emit('close')
}

function handlePanelKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
    return
  }

  if (event.key === 'Tab') {
    emit('close')
    return
  }

  handleRichTextGridKeydown(event, {
    root: panel.value,
    columns: MAX_COLUMNS,
  })
}
</script>

<template>
  <div
    ref="panel"
    data-test="rich-text-table-size-picker"
    class="w-fit rounded-(--rich-text-theme-border-radius) p-2"
    role="dialog"
    aria-label="插入表格"
    aria-modal="false"
    @keydown="handlePanelKeydown"
  >
    <div class="mb-2 flex items-center justify-between gap-3 text-sm">
      <span>插入表格</span>
      <output data-test="rich-text-table-size-label">{{ rows }} 行 × {{ columns }} 列</output>
    </div>
    <div role="grid" aria-label="表格尺寸选择">
      <div v-for="cellRow in MAX_ROWS" :key="cellRow" role="row" class="flex">
        <button
          v-for="cellColumn in MAX_COLUMNS"
          :key="cellColumn"
          type="button"
          role="gridcell"
          data-rich-text-grid-item
          :tabindex="isCellActive(cellRow, cellColumn) ? 0 : -1"
          :aria-label="`${cellRow} 行 ${cellColumn} 列`"
          :aria-selected="isCellActive(cellRow, cellColumn)"
          class="m-px size-6 rounded-sm border border-stone-200 hover:bg-(--rich-text-theme-primary-muted-color) dark:border-zinc-500/60"
          :class="
            isCellHighlighted(cellRow, cellColumn)
              ? 'bg-(--rich-text-theme-primary-muted-color)'
              : undefined
          "
          @focus="setSize(cellRow, cellColumn)"
          @mouseenter="setSize(cellRow, cellColumn)"
          @click="insertTable(cellRow, cellColumn)"
        />
      </div>
    </div>
  </div>
</template>
