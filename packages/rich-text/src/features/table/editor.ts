import type { CommandProps } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  cellAround,
  CellSelection,
  columnIsHeader,
  findTable,
  mergeCells,
  rowIsHeader,
  selectedRect,
  splitCell,
  TableMap,
} from '@tiptap/pm/tables'
import { TextSelection, type Selection } from '@tiptap/pm/state'
import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { tableFeature } from './shared'

const DEFAULT_TABLE_ROWS = 3
const DEFAULT_TABLE_COLUMNS = 3

export type TableCellAlignment = null | 'left' | 'center' | 'right'

interface TableCellTarget {
  readonly node: ProseMirrorNode
  readonly pos: number
}

function getTargetTableCells(selection: Selection): TableCellTarget[] {
  if (selection instanceof CellSelection) {
    const cells = new Map<number, ProseMirrorNode>()

    selection.forEachCell((node, pos) => {
      cells.set(pos, node)
    })

    return [...cells]
      .sort(([firstPosition], [secondPosition]) => firstPosition - secondPosition)
      .map(([pos, node]) => ({ node, pos }))
  }

  if (!(selection instanceof TextSelection)) {
    return []
  }

  const fromCell = cellAround(selection.$from)
  const cell = fromCell?.nodeAfter

  if (!fromCell || !cell) {
    return []
  }

  if (selection.empty) {
    return [{ node: cell, pos: fromCell.pos }]
  }

  const toCell = cellAround(selection.$to)

  return toCell?.pos === fromCell.pos ? [{ node: cell, pos: fromCell.pos }] : []
}

function getCellAlignment(cell: ProseMirrorNode): TableCellAlignment {
  const { align } = cell.attrs

  return align === 'left' || align === 'center' || align === 'right' ? align : null
}

function getUniformCellAlignment(selection: Selection): TableCellAlignment | undefined {
  const cells = getTargetTableCells(selection)

  if (!cells.length) {
    return undefined
  }

  const alignment = getCellAlignment(cells[0]!.node)

  return cells.every(({ node }) => getCellAlignment(node) === alignment) ? alignment : undefined
}

function getMergedCellColwidth(state: CommandProps['state']) {
  const rect = selectedRect(state)
  const colwidth = Array.from({ length: rect.right - rect.left }, (_, index) => {
    const column = rect.left + index

    for (let row = 0; row < rect.map.height; row += 1) {
      const position = rect.map.map[row * rect.map.width + column]!
      const cell = rect.table.nodeAt(position)

      if (!cell) {
        continue
      }

      const cellRect = rect.map.findCell(position)
      const width = (cell.attrs.colwidth as number[] | null)?.[column - cellRect.left]

      if (width) {
        return width
      }
    }

    return 0
  })

  return colwidth.some((width) => width !== 0) ? colwidth : null
}

function mergeCellsPreservingColwidth({ state, dispatch }: CommandProps) {
  const cells = getTargetTableCells(state.selection)

  if (!(state.selection instanceof CellSelection) || cells.length < 2) {
    return false
  }

  if (!dispatch) {
    return mergeCells(state)
  }

  const colwidth = getMergedCellColwidth(state)

  return mergeCells(state, (tr) => {
    const selection = tr.selection

    if (selection instanceof CellSelection) {
      const cell = selection.$anchorCell.nodeAfter

      if (cell) {
        tr.setNodeMarkup(selection.$anchorCell.pos, null, { ...cell.attrs, colwidth })
      }
    }

    dispatch(tr)
  })
}

function splitTargetCell({ state, dispatch }: CommandProps) {
  const cells = getTargetTableCells(state.selection)
  const cell = cells[0]?.node

  if (!cell || cells.length !== 1 || (cell.attrs.colspan === 1 && cell.attrs.rowspan === 1)) {
    return false
  }

  return splitCell(state, dispatch)
}

function toggleTargetCellHeaders({ state, tr, dispatch }: CommandProps) {
  const cells = getTargetTableCells(state.selection)
  const tableCell = state.schema.nodes.tableCell
  const tableHeader = state.schema.nodes.tableHeader

  if (!cells.length || !tableCell || !tableHeader) {
    return false
  }

  const allHeaders = cells.every(({ node }) => node.type === tableHeader)
  const targetType = allHeaders ? tableCell : tableHeader
  const cellsToChange = cells.filter(({ node }) => node.type !== targetType)

  if (!cellsToChange.length) {
    return false
  }

  if (dispatch) {
    for (const { node, pos } of cellsToChange) {
      tr.setNodeMarkup(pos, targetType, node.attrs)
    }
  }

  return true
}

function setTargetCellAlignment(
  { state, tr, dispatch }: CommandProps,
  alignment: TableCellAlignment,
) {
  const cells = getTargetTableCells(state.selection)
  const cellsToChange = cells.filter(({ node }) => getCellAlignment(node) !== alignment)

  if (!cells.length || !cellsToChange.length) {
    return false
  }

  if (dispatch) {
    for (const { node, pos } of cellsToChange) {
      tr.setNodeMarkup(pos, null, { ...node.attrs, align: alignment })
    }
  }

  return true
}

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
  command: ({ chain, state }, rows: number, columns: number) => {
    if (!canInsertTable(state.selection, rows, columns)) {
      return false
    }

    return chain().focus().insertTable({ rows, cols: columns, withHeaderRow: true }).run()
  },
})

export const tableAction = defineRichTextAction(tableFeature, {
  key: tableFeature.key,
  command: (props) => insertTableAction.command(props, DEFAULT_TABLE_ROWS, DEFAULT_TABLE_COLUMNS),
})

export const addRowBeforeAction = defineRichTextAction(tableFeature, {
  key: 'add-row-before',
  command: ({ chain }) => chain().focus().addRowBefore().run(),
})

export const addRowAfterAction = defineRichTextAction(tableFeature, {
  key: 'add-row-after',
  command: ({ chain }) => chain().focus().addRowAfter().run(),
})

export const deleteRowAction = defineRichTextAction(tableFeature, {
  key: 'delete-row',
  command: ({ chain, state }) => {
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
  command: ({ chain }) => chain().focus().addColumnBefore().run(),
})

export const addColumnAfterAction = defineRichTextAction(tableFeature, {
  key: 'add-column-after',
  command: ({ chain }) => chain().focus().addColumnAfter().run(),
})

export const deleteColumnAction = defineRichTextAction(tableFeature, {
  key: 'delete-column',
  command: ({ chain, state }) => {
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
  command: ({ chain }) => chain().focus().deleteTable().run(),
})

export const toggleHeaderRowAction = defineRichTextAction(tableFeature, {
  key: 'toggle-header-row',
  command: ({ chain }) => chain().focus().toggleHeaderRow().run(),
  isActive: (editor) => {
    const table = getSelectedTable(editor.state.selection)
    return table ? rowIsHeader(TableMap.get(table.node), table.node, 0) : false
  },
})

export const toggleHeaderColumnAction = defineRichTextAction(tableFeature, {
  key: 'toggle-header-column',
  command: ({ chain }) => chain().focus().toggleHeaderColumn().run(),
  isActive: (editor) => {
    const table = getSelectedTable(editor.state.selection)
    return table ? columnIsHeader(TableMap.get(table.node), table.node, 0) : false
  },
})

export const mergeCellsAction = defineRichTextAction(tableFeature, {
  key: 'merge-cells',
  command: ({ chain }) => chain().focus().command(mergeCellsPreservingColwidth).run(),
})

export const splitCellAction = defineRichTextAction(tableFeature, {
  key: 'split-cell',
  command: ({ chain }) => chain().focus().command(splitTargetCell).run(),
})

export const toggleHeaderCellAction = defineRichTextAction(tableFeature, {
  key: 'toggle-header-cell',
  command: ({ chain }) => chain().focus().command(toggleTargetCellHeaders).run(),
  isActive: (editor) => {
    const cells = getTargetTableCells(editor.state.selection)

    return cells.length > 0 && cells.every(({ node }) => node.type.name === 'tableHeader')
  },
})

export const setCellAlignAction = defineRichTextAction(tableFeature, {
  key: 'set-cell-align',
  command: ({ chain }, alignment: TableCellAlignment) =>
    chain()
      .focus()
      .command((props) => setTargetCellAlignment(props, alignment))
      .run(),
  isActive: (editor, alignment) => getUniformCellAlignment(editor.state.selection) === alignment,
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

export const toggleHeaderColumnActionItem = defineRichTextActionItem(toggleHeaderColumnAction, {
  label: '首列作为表头',
  icon: 'i-[lucide--table-columns-split]',
})

export const mergeCellsActionItem = defineRichTextActionItem(mergeCellsAction, {
  label: '合并单元格',
  icon: 'i-[lucide--combine]',
})

export const splitCellActionItem = defineRichTextActionItem(splitCellAction, {
  label: '拆分单元格',
  icon: 'i-[lucide--split]',
})

export const toggleHeaderCellActionItem = defineRichTextActionItem(toggleHeaderCellAction, {
  label: '设置表头单元格',
  icon: 'i-[lucide--table-properties]',
})

export const cellAlignActionItems = [
  {
    ...defineRichTextActionItem(setCellAlignAction, {
      label: '默认',
      icon: 'i-[lucide--align-left]',
    }),
    alignment: null,
  },
  {
    ...defineRichTextActionItem(setCellAlignAction, {
      label: '左对齐',
      icon: 'i-[lucide--align-left]',
    }),
    alignment: 'left',
  },
  {
    ...defineRichTextActionItem(setCellAlignAction, {
      label: '居中',
      icon: 'i-[lucide--align-center]',
    }),
    alignment: 'center',
  },
  {
    ...defineRichTextActionItem(setCellAlignAction, {
      label: '右对齐',
      icon: 'i-[lucide--align-right]',
    }),
    alignment: 'right',
  },
] as const

export const deleteTableActionItem = defineRichTextActionItem(deleteTableAction, {
  label: '删除表格',
  icon: 'i-[lucide--trash-2]',
})

export const tableEditorFeature = defineRichTextEditorFeature(tableFeature, {})
