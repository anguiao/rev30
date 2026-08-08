import type { CommandProps, NodeWithPos } from '@tiptap/core'
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
import { TextSelection, type EditorState, type Selection } from '@tiptap/pm/state'
import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { normalizeTableCellAlign, type TableCellAlign } from './core/attrs'
import { tableFeature } from './core/feature'

const defaultTableRows = 3
const defaultTableColumns = 3

function getTargetTableCells(selection: Selection): NodeWithPos[] {
  if (selection instanceof CellSelection) {
    const cells: NodeWithPos[] = []

    selection.forEachCell((node, pos) => {
      cells.push({ node, pos })
    })

    return cells
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

function getUniformCellAlignment(selection: Selection): TableCellAlign | null | undefined {
  const [firstCell, ...remainingCells] = getTargetTableCells(selection)

  if (!firstCell) {
    return undefined
  }

  const alignment = normalizeTableCellAlign(firstCell.node.attrs.align)

  return remainingCells.every(({ node }) => normalizeTableCellAlign(node.attrs.align) === alignment)
    ? alignment
    : undefined
}

function getMergedCellColwidth(state: EditorState) {
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
  if (!dispatch) {
    return mergeCells(state)
  }

  return mergeCells(state, (tr) => {
    const colwidth = getMergedCellColwidth(state)
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
  if (getTargetTableCells(state.selection).length !== 1) {
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
  alignment: TableCellAlign | null,
) {
  const cells = getTargetTableCells(state.selection)
  const cellsToChange = cells.filter(
    ({ node }) => normalizeTableCellAlign(node.attrs.align) !== alignment,
  )

  if (!cellsToChange.length) {
    return false
  }

  if (dispatch) {
    for (const { node, pos } of cellsToChange) {
      tr.setNodeMarkup(pos, null, { ...node.attrs, align: alignment })
    }
  }

  return true
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
  command: (props) => insertTableAction.command(props, defaultTableRows, defaultTableColumns),
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
  command: ({ chain }, alignment: TableCellAlign | null) =>
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
  icon: 'i-[lucide--panel-top]',
})

export const toggleHeaderColumnActionItem = defineRichTextActionItem(toggleHeaderColumnAction, {
  label: '首列作为表头',
  icon: 'i-[lucide--panel-left]',
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
  icon: 'i-[lucide--heading]',
})

export const setCellAlignDefaultActionItem = defineRichTextActionItem(
  defineRichTextAction(tableFeature, {
    key: 'set-cell-align-default',
    command: (props) => setCellAlignAction.command(props, null),
    isActive: (editor) => setCellAlignAction.isActive?.(editor, null) ?? false,
  }),
  {
    label: '默认',
    icon: 'i-[lucide--align-left]',
  },
)

export const setCellAlignLeftActionItem = defineRichTextActionItem(
  defineRichTextAction(tableFeature, {
    key: 'set-cell-align-left',
    command: (props) => setCellAlignAction.command(props, 'left'),
    isActive: (editor) => setCellAlignAction.isActive?.(editor, 'left') ?? false,
  }),
  {
    label: '左对齐',
    icon: 'i-[lucide--align-left]',
  },
)

export const setCellAlignCenterActionItem = defineRichTextActionItem(
  defineRichTextAction(tableFeature, {
    key: 'set-cell-align-center',
    command: (props) => setCellAlignAction.command(props, 'center'),
    isActive: (editor) => setCellAlignAction.isActive?.(editor, 'center') ?? false,
  }),
  {
    label: '居中',
    icon: 'i-[lucide--align-center]',
  },
)

export const setCellAlignRightActionItem = defineRichTextActionItem(
  defineRichTextAction(tableFeature, {
    key: 'set-cell-align-right',
    command: (props) => setCellAlignAction.command(props, 'right'),
    isActive: (editor) => setCellAlignAction.isActive?.(editor, 'right') ?? false,
  }),
  {
    label: '右对齐',
    icon: 'i-[lucide--align-right]',
  },
)

export const deleteTableActionItem = defineRichTextActionItem(deleteTableAction, {
  label: '删除表格',
  icon: 'i-[lucide--trash-2]',
})

export const tableEditorFeature = defineRichTextEditorFeature(tableFeature, {})
