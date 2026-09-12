import type { Editor } from '@tiptap/core'
import { CellSelection, TableMap } from '@tiptap/pm/tables'

export function getTableCellPosition(editor: Editor, row: number, column: number) {
  let tablePosition: number | undefined
  let table: ReturnType<typeof editor.state.doc.nodeAt> | undefined

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'table') {
      table = node
      tablePosition = position
      return false
    }

    return true
  })

  if (!table || tablePosition === undefined) {
    throw new Error('Expected a table')
  }

  const map = TableMap.get(table)
  const position = map.map[row * map.width + column]

  if (position === undefined) {
    throw new Error('Expected a table cell')
  }

  return tablePosition + position + 1
}

export function getTableCell(editor: Editor, row: number, column: number) {
  const cell = editor.state.doc.nodeAt(getTableCellPosition(editor, row, column))

  if (!cell) {
    throw new Error('Expected a table cell')
  }

  return cell
}

export function selectTableCells(
  editor: Editor,
  anchor: readonly [row: number, column: number],
  head: readonly [row: number, column: number],
) {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      new CellSelection(
        editor.state.doc.resolve(getTableCellPosition(editor, anchor[0], anchor[1])),
        editor.state.doc.resolve(getTableCellPosition(editor, head[0], head[1])),
      ),
    ),
  )
}
