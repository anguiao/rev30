import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { TextSelection, type Selection } from '@tiptap/pm/state'
import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { tableFeature } from './shared'

export type RichTextTableSelectionType = 'cursor' | 'text' | 'cell'

export interface RichTextTableContext {
  readonly tableNode: ProseMirrorNode
  readonly tablePosition: number
  readonly selectionType: RichTextTableSelectionType
  readonly cellPosition?: number
}

interface TablePositionContext {
  readonly tableNode: ProseMirrorNode
  readonly tablePosition: number
  readonly cellPosition: number
}

function findTablePosition($pos: ResolvedPos): TablePositionContext | null {
  let cellDepth = -1
  let tableDepth = -1

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)

    if (cellDepth < 0 && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
      cellDepth = depth
    }

    if (node.type.name === 'table') {
      tableDepth = depth
      break
    }
  }

  if (cellDepth < 0 || tableDepth < 0) {
    return null
  }

  return {
    tableNode: $pos.node(tableDepth),
    tablePosition: $pos.before(tableDepth),
    cellPosition: $pos.before(cellDepth),
  }
}

function findCellSelectionTable(selection: CellSelection): RichTextTableContext | null {
  const { $anchorCell, $headCell } = selection
  const tableNode = $anchorCell.node(-1)

  if (tableNode.type.name !== 'table' || tableNode !== $headCell.node(-1)) {
    return null
  }

  const tablePosition = $anchorCell.before($anchorCell.depth - 1)

  return {
    tableNode,
    tablePosition,
    selectionType: 'cell',
    cellPosition: $anchorCell.pos,
  }
}

function isTextSelection(selection: Selection): selection is TextSelection {
  return selection instanceof TextSelection
}

export function resolveRichTextTableContext(selection: Selection): RichTextTableContext | null {
  if (selection instanceof CellSelection) {
    return findCellSelectionTable(selection)
  }

  const from = findTablePosition(selection.$from)

  if (!from) {
    return null
  }

  const to = findTablePosition(selection.$to)

  if (!to || to.tableNode !== from.tableNode) {
    return null
  }

  const selectionType = isTextSelection(selection)
    ? selection.empty
      ? 'cursor'
      : 'text'
    : 'cursor'

  return {
    tableNode: from.tableNode,
    tablePosition: from.tablePosition,
    selectionType,
    cellPosition: from.cellPosition,
  }
}

export const resolveTableContext = resolveRichTextTableContext

export function getRichTextTableWrapperElement(
  editor: Editor,
  context: Pick<RichTextTableContext, 'tablePosition'>,
) {
  const nodeDOM = editor.view.nodeDOM(context.tablePosition)

  if (!(nodeDOM instanceof HTMLElement)) {
    return null
  }

  return nodeDOM.matches('.tableWrapper') ? nodeDOM : nodeDOM.closest<HTMLElement>('.tableWrapper')
}

export function isRichTextTableHeaderRow(table: ProseMirrorNode) {
  const firstRow = table.firstChild

  return Boolean(
    firstRow &&
    firstRow.childCount > 0 &&
    Array.from({ length: firstRow.childCount }, (_, index) => firstRow.child(index)).every(
      (cell) => cell.type.name === 'tableHeader',
    ),
  )
}

function isPositiveTableSize(value: number) {
  return Number.isSafeInteger(value) && value > 0
}

function canInsertTable(selection: Selection, rows: number, columns: number) {
  return (
    isPositiveTableSize(rows) &&
    isPositiveTableSize(columns) &&
    selection.empty &&
    resolveRichTextTableContext(selection) === null
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

function defineTableStructureAction(
  key:
    | 'add-row-before'
    | 'add-row-after'
    | 'delete-row'
    | 'add-column-before'
    | 'add-column-after'
    | 'delete-column'
    | 'delete-table',
  commandName:
    | 'addRowBefore'
    | 'addRowAfter'
    | 'deleteRow'
    | 'addColumnBefore'
    | 'addColumnAfter'
    | 'deleteColumn'
    | 'deleteTable',
  canRun?: (context: RichTextTableContext, selection: Selection) => boolean,
) {
  return defineRichTextAction(tableFeature, {
    key,
    command:
      () =>
      ({ chain, state }) => {
        const context = resolveRichTextTableContext(state.selection)

        if (!context || (canRun && !canRun(context, state.selection))) {
          return false
        }

        return chain().focus()[commandName]().run()
      },
  })
}

export const addRowBeforeAction = defineTableStructureAction('add-row-before', 'addRowBefore')
export const addRowAfterAction = defineTableStructureAction('add-row-after', 'addRowAfter')
export const deleteRowAction = defineTableStructureAction(
  'delete-row',
  'deleteRow',
  (context, selection) =>
    context.tableNode.childCount > 1 &&
    !(selection instanceof CellSelection && selection.isColSelection()),
)
export const addColumnBeforeAction = defineTableStructureAction(
  'add-column-before',
  'addColumnBefore',
)
export const addColumnAfterAction = defineTableStructureAction('add-column-after', 'addColumnAfter')
export const deleteColumnAction = defineTableStructureAction(
  'delete-column',
  'deleteColumn',
  (context, selection) =>
    TableMap.get(context.tableNode).width > 1 &&
    !(selection instanceof CellSelection && selection.isRowSelection()),
)
export const deleteTableAction = defineTableStructureAction('delete-table', 'deleteTable')

export const toggleHeaderRowAction = defineRichTextAction(tableFeature, {
  key: 'toggle-header-row',
  command:
    () =>
    ({ chain, state }) => {
      if (!resolveRichTextTableContext(state.selection)) {
        return false
      }

      return chain().focus().toggleHeaderRow().run()
    },
  isActive: (editor) => {
    const context = resolveRichTextTableContext(editor.state.selection)
    return context ? isRichTextTableHeaderRow(context.tableNode) : false
  },
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
