import { cellAround, CellSelection, findTable, rowIsHeader, TableMap } from '@tiptap/pm/tables'
import type { Selection } from '@tiptap/pm/state'
import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { tableFeature } from './shared'

const DEFAULT_TABLE_ROWS = 3
const DEFAULT_TABLE_COLUMNS = 3

export function getSelectedTable(selection: Selection) {
  const isCellSelection = selection instanceof CellSelection
  const fromCell = isCellSelection ? selection.$anchorCell : cellAround(selection.$from)
  const toCell = isCellSelection ? selection.$headCell : cellAround(selection.$to)

  if (!fromCell || !toCell) {
    return null
  }

  const table = findTable(fromCell)

  return table && findTable(toCell)?.node === table.node ? table : null
}

function isPositiveTableSize(value: number) {
  return Number.isSafeInteger(value) && value > 0
}

function canInsertTable(selection: Selection, rows: number, columns: number) {
  return (
    isPositiveTableSize(rows) &&
    isPositiveTableSize(columns) &&
    selection.empty &&
    getSelectedTable(selection) === null
  )
}

export const insertTableAction = defineRichTextAction(tableFeature, {
  key: 'insert-table',
  command:
    (rows: number, columns: number) =>
    ({ chain, state }) => {
      if (!canInsertTable(state.selection, rows, columns)) {
        return false
      }

      return chain().focus().insertTable({ rows, cols: columns, withHeaderRow: true }).run()
    },
})

export const tableAction = defineRichTextAction(tableFeature, {
  key: tableFeature.key,
  command: () => insertTableAction.command(DEFAULT_TABLE_ROWS, DEFAULT_TABLE_COLUMNS),
})

export const addRowBeforeAction = defineRichTextAction(tableFeature, {
  key: 'add-row-before',
  command:
    () =>
    ({ chain }) =>
      chain().focus().addRowBefore().run(),
})

export const addRowAfterAction = defineRichTextAction(tableFeature, {
  key: 'add-row-after',
  command:
    () =>
    ({ chain }) =>
      chain().focus().addRowAfter().run(),
})

export const deleteRowAction = defineRichTextAction(tableFeature, {
  key: 'delete-row',
  command:
    () =>
    ({ chain, state }) => {
      const { selection } = state
      const table = getSelectedTable(selection)

      if (
        !table ||
        table.node.childCount <= 1 ||
        (selection instanceof CellSelection && selection.isColSelection())
      ) {
        return false
      }

      return chain().focus().deleteRow().run()
    },
})

export const addColumnBeforeAction = defineRichTextAction(tableFeature, {
  key: 'add-column-before',
  command:
    () =>
    ({ chain }) =>
      chain().focus().addColumnBefore().run(),
})

export const addColumnAfterAction = defineRichTextAction(tableFeature, {
  key: 'add-column-after',
  command:
    () =>
    ({ chain }) =>
      chain().focus().addColumnAfter().run(),
})

export const deleteColumnAction = defineRichTextAction(tableFeature, {
  key: 'delete-column',
  command:
    () =>
    ({ chain, state }) => {
      const { selection } = state
      const table = getSelectedTable(selection)

      if (
        !table ||
        TableMap.get(table.node).width <= 1 ||
        (selection instanceof CellSelection && selection.isRowSelection())
      ) {
        return false
      }

      return chain().focus().deleteColumn().run()
    },
})

export const deleteTableAction = defineRichTextAction(tableFeature, {
  key: 'delete-table',
  command:
    () =>
    ({ chain }) =>
      chain().focus().deleteTable().run(),
})

export const toggleHeaderRowAction = defineRichTextAction(tableFeature, {
  key: 'toggle-header-row',
  command:
    () =>
    ({ chain }) =>
      chain().focus().toggleHeaderRow().run(),
  isActive: (editor) => {
    const table = getSelectedTable(editor.state.selection)
    return table ? rowIsHeader(TableMap.get(table.node), table.node, 0) : false
  },
})

export const tableActionItem = defineRichTextActionItem(tableAction, {
  label: '表格',
  icon: 'i-[lucide--table-2]',
  keywords: ['table'],
})

export const addRowBeforeActionItem = defineRichTextActionItem(addRowBeforeAction, {
  label: '上方新增行',
  icon: 'i-[lucide--rows-3]',
})

export const addRowAfterActionItem = defineRichTextActionItem(addRowAfterAction, {
  label: '下方新增行',
  icon: 'i-[lucide--rows-3]',
})

export const deleteRowActionItem = defineRichTextActionItem(deleteRowAction, {
  label: '删除行',
  icon: 'i-[lucide--trash-2]',
})

export const addColumnBeforeActionItem = defineRichTextActionItem(addColumnBeforeAction, {
  label: '左侧新增列',
  icon: 'i-[lucide--columns-3]',
})

export const addColumnAfterActionItem = defineRichTextActionItem(addColumnAfterAction, {
  label: '右侧新增列',
  icon: 'i-[lucide--columns-3]',
})

export const deleteColumnActionItem = defineRichTextActionItem(deleteColumnAction, {
  label: '删除列',
  icon: 'i-[lucide--trash-2]',
})

export const toggleHeaderRowActionItem = defineRichTextActionItem(toggleHeaderRowAction, {
  label: '首行作为表头',
  icon: 'i-[lucide--table-2]',
})

export const deleteTableActionItem = defineRichTextActionItem(deleteTableAction, {
  label: '删除表格',
  icon: 'i-[lucide--trash-2]',
})

export const tableEditorFeature = defineRichTextEditorFeature(tableFeature, {})
