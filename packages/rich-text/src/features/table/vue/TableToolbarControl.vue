<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { RichTextInsertTableOptions, RichTextTableInsertDimension } from '../shared'
import { NButton, NCheckbox, NInputNumber, NPopover } from 'naive-ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  addTableColumnAfterAction,
  addTableColumnBeforeAction,
  addTableRowAfterAction,
  addTableRowBeforeAction,
  deleteTableAction,
  deleteTableColumnAction,
  deleteTableRowAction,
  insertTableAction,
  mergeTableCellsAction,
  splitTableCellAction,
  toggleTableHeaderRowAction,
} from '../editor'

const props = withDefaults(defineProps<RichTextToolbarControlInjectedProps>(), {
  disabled: false,
})

const rows = ref<number | null>(3)
const columns = ref<number | null>(3)
const withHeaderRow = ref(true)
const showPopover = ref(false)
const popoverMode = ref<'insert' | 'edit'>('insert')
const editorRevision = ref(0)

const tableActionGroups = [
  {
    label: '行',
    actions: [
      { action: addTableRowBeforeAction, label: '上方插入行' },
      { action: addTableRowAfterAction, label: '下方插入行' },
      { action: deleteTableRowAction, label: '删除行' },
    ],
  },
  {
    label: '列',
    actions: [
      { action: addTableColumnBeforeAction, label: '左侧插入列' },
      { action: addTableColumnAfterAction, label: '右侧插入列' },
      { action: deleteTableColumnAction, label: '删除列' },
    ],
  },
  {
    label: '单元格',
    actions: [
      { action: mergeTableCellsAction, label: '合并单元格' },
      { action: splitTableCellAction, label: '拆分单元格' },
    ],
  },
  {
    label: '结构',
    actions: [
      { action: toggleTableHeaderRowAction, label: '切换表头行' },
      { action: deleteTableAction, label: '删除表格' },
    ],
  },
] as const

type TableAction = (typeof tableActionGroups)[number]['actions'][number]['action']

const isUnavailable = computed(() => props.disabled || !props.editor)
const isInTable = computed(() => {
  void editorRevision.value
  return props.editor?.isActive('table') ?? false
})

function isInsertDimension(value: number | null): value is RichTextTableInsertDimension {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 10
}

const insertOptions = computed<RichTextInsertTableOptions | null>(() => {
  if (!isInsertDimension(rows.value) || !isInsertDimension(columns.value)) {
    return null
  }

  return {
    rows: rows.value,
    cols: columns.value,
    withHeaderRow: withHeaderRow.value,
  }
})

const canInsert = computed(() => {
  void editorRevision.value
  const editor = props.editor
  const options = insertOptions.value

  return (
    !isUnavailable.value &&
    !!editor &&
    !!options &&
    (insertTableAction.canRun?.(editor, options) ?? true)
  )
})

function closePopover() {
  showPopover.value = false
}

function handleEditorSelectionUpdate() {
  editorRevision.value += 1

  if (
    showPopover.value &&
    popoverMode.value === 'edit' &&
    !(props.editor?.isActive('table') ?? false)
  ) {
    closePopover()
  }
}

watch(
  () => props.editor,
  (editor, previousEditor) => {
    previousEditor?.off('selectionUpdate', handleEditorSelectionUpdate)
    editor?.on('selectionUpdate', handleEditorSelectionUpdate)
    editorRevision.value += 1

    if (!editor) {
      closePopover()
    }
  },
  { immediate: true },
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closePopover()
    }
  },
)

onBeforeUnmount(() => {
  props.editor?.off('selectionUpdate', handleEditorSelectionUpdate)
})

function togglePopover() {
  if (isUnavailable.value) {
    return
  }

  if (showPopover.value) {
    closePopover()
    return
  }

  popoverMode.value = isInTable.value ? 'edit' : 'insert'
  showPopover.value = true
}

function insertTable() {
  const editor = props.editor
  const options = insertOptions.value

  if (!editor || !options || !canInsert.value) {
    return
  }

  insertTableAction.run(editor, options)
  closePopover()
}

function canRun(action: TableAction) {
  void editorRevision.value
  const editor = props.editor

  return !isUnavailable.value && !!editor && (action.canRun?.(editor) ?? true)
}

function runAction(action: TableAction) {
  const editor = props.editor

  if (!editor || !canRun(action)) {
    return
  }

  action.run(editor)

  if (action === deleteTableAction) {
    closePopover()
  }
}
</script>

<template>
  <NPopover
    :show="showPopover"
    trigger="manual"
    placement="bottom-start"
    :disabled="isUnavailable"
    @clickoutside="closePopover"
  >
    <template #trigger>
      <NButton
        data-test="rich-text-table"
        :data-active="isInTable ? 'true' : undefined"
        :disabled="isUnavailable"
        size="small"
        style="--n-padding: 0 6px"
        :type="isInTable ? 'primary' : 'default'"
        :secondary="isInTable"
        :quaternary="!isInTable"
        title="表格"
        aria-label="表格"
        :aria-pressed="isInTable"
        @mousedown.prevent
        @click="togglePopover"
      >
        <span class="i-[lucide--table-2]" aria-hidden="true" />
      </NButton>
    </template>

    <div
      v-if="popoverMode === 'insert'"
      data-test="rich-text-table-insert-panel"
      class="w-64 space-y-3"
    >
      <div class="grid grid-cols-2 gap-2">
        <label class="space-y-1 text-sm">
          <span>行数</span>
          <NInputNumber
            v-model:value="rows"
            data-test="rich-text-table-rows"
            aria-label="行数"
            :min="1"
            :max="10"
            :precision="0"
            size="small"
          />
        </label>
        <label class="space-y-1 text-sm">
          <span>列数</span>
          <NInputNumber
            v-model:value="columns"
            data-test="rich-text-table-cols"
            aria-label="列数"
            :min="1"
            :max="10"
            :precision="0"
            size="small"
          />
        </label>
      </div>

      <NCheckbox v-model:checked="withHeaderRow" data-test="rich-text-table-header-row">
        包含表头行
      </NCheckbox>

      <div class="flex justify-end">
        <NButton
          data-test="rich-text-table-insert"
          type="primary"
          size="small"
          :disabled="!canInsert"
          @mousedown.prevent
          @click="insertTable"
        >
          插入表格
        </NButton>
      </div>
    </div>

    <div v-else data-test="rich-text-table-actions" class="w-80 space-y-3">
      <section v-for="group in tableActionGroups" :key="group.label" class="space-y-1.5">
        <div class="text-text-3 text-xs">
          {{ group.label }}
        </div>
        <div class="flex flex-wrap gap-1">
          <NButton
            v-for="item in group.actions"
            :key="item.action.key"
            :data-test="`rich-text-table-${item.action.key}`"
            size="small"
            quaternary
            :disabled="!canRun(item.action)"
            :title="item.label"
            :aria-label="item.label"
            @mousedown.prevent
            @click="runAction(item.action)"
          >
            {{ item.label }}
          </NButton>
        </div>
      </section>
    </div>
  </NPopover>
</template>
