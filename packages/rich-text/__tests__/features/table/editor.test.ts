import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import TextAlign from '@tiptap/extension-text-align'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { TextSelection } from '@tiptap/pm/state'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { describe, expect, it } from 'vitest'
import { canRunRichTextAction, runRichTextAction } from '../../../src/editor/action'
import {
  addColumnAfterAction,
  addColumnBeforeAction,
  addRowAfterAction,
  addRowBeforeAction,
  deleteColumnAction,
  deleteRowAction,
  deleteTableAction,
  getSelectedTable,
  insertTableAction,
  mergeCellsAction,
  setCellAlignAction,
  splitCellAction,
  tableEditorFeature,
  toggleHeaderCellAction,
  toggleHeaderColumnAction,
  toggleHeaderRowAction,
} from '../../../src/features/table/editor'
import { tableFeature } from '../../../src/features/table/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string | object = '<p>前后</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, ...tableFeature.sharedExtensions!()],
    content,
  })
}

function getTable(editor: ReturnType<typeof createEditor>) {
  const table = editor.state.doc.firstChild

  if (!table || table.type.name !== 'table') {
    throw new Error('Expected a table')
  }

  return table
}

type TableCellType = 'tableCell' | 'tableHeader'

interface TestTableCellAttributes {
  align?: null | 'left' | 'center' | 'right'
  colspan?: number
  colwidth?: number[] | null
  rowspan?: number
}

function tableCell(type: TableCellType, text: string, attributes: TestTableCellAttributes = {}) {
  return {
    type,
    attrs: {
      colspan: 1,
      rowspan: 1,
      colwidth: null,
      align: null,
      ...attributes,
    },
    content: [
      {
        type: 'paragraph',
        ...(text ? { content: [{ type: 'text', text }] } : {}),
      },
    ],
  }
}

function createTableEditor(rows: ReturnType<typeof tableCell>[][]) {
  return createEditor({
    type: 'doc',
    content: [
      {
        type: 'table',
        content: rows.map((content) => ({ type: 'tableRow', content })),
      },
    ],
  })
}

function getTableStart(editor: ReturnType<typeof createEditor>) {
  let tablePosition: number | undefined

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'table') {
      tablePosition = position
      return false
    }

    return true
  })

  if (tablePosition === undefined) {
    throw new Error('Expected a table position')
  }

  return tablePosition + 1
}

function getTableCellPosition(
  editor: ReturnType<typeof createEditor>,
  row: number,
  column: number,
) {
  const table = getTable(editor)
  const map = TableMap.get(table)
  const position = map.map[row * map.width + column]

  if (position === undefined) {
    throw new Error('Expected a table cell position')
  }

  return getTableStart(editor) + position
}

function getTableCell(editor: ReturnType<typeof createEditor>, row: number, column: number) {
  const cell = editor.state.doc.nodeAt(getTableCellPosition(editor, row, column))

  if (!cell) {
    throw new Error('Expected a table cell')
  }

  return cell
}

function selectTableCells(
  editor: ReturnType<typeof createEditor>,
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

describe('table editor actions', () => {
  it('declares the editor implementation and inserts requested sizes with a header row', () => {
    expect(tableEditorFeature.feature.key).toBe('table')

    const editor = createEditor()
    expect(runRichTextAction(editor, insertTableAction, 3, 3)).toBe(true)

    const table = getTable(editor)
    expect(table.childCount).toBe(3)
    expect(table.firstChild?.childCount).toBe(3)
    expect(table.firstChild?.firstChild?.type.name).toBe('tableHeader')
    expect(table.child(1).firstChild?.type.name).toBe('tableCell')
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(editor.state.selection.$from.node(-1).type.name).toBe('tableHeader')
  })

  it('splits a paragraph around an inserted table without adding placeholder blocks', () => {
    const editor = createEditor('<p>前缀后缀</p>')
    editor.commands.setTextSelection({ from: 3, to: 3 })

    expect(runRichTextAction(editor, insertTableAction, 1, 1)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '前缀' }] },
        { type: 'table' },
        { type: 'paragraph', content: [{ type: 'text', text: '后缀' }] },
      ],
    })
  })

  it('rejects non-empty selections outside tables and nested insertion inside a cell', () => {
    const editor = createEditor('<p>前缀后缀</p>')
    editor.commands.setTextSelection({ from: 2, to: 4 })
    expect(canRunRichTextAction(editor, insertTableAction, 1, 1)).toBe(false)
    expect(runRichTextAction(editor, insertTableAction, 1, 1)).toBe(false)

    editor.commands.setTextSelection({ from: 1, to: 1 })
    expect(runRichTextAction(editor, insertTableAction, 1, 1)).toBe(true)
    expect(getSelectedTable(editor.state.selection)).not.toBeNull()
    expect(canRunRichTextAction(editor, insertTableAction, 1, 1)).toBe(false)
  })

  it('adds and deletes rows and columns through the native table commands', () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)

    expect(runRichTextAction(editor, addRowBeforeAction)).toBe(true)
    expect(getTable(editor).childCount).toBe(3)
    expect(runRichTextAction(editor, addRowAfterAction)).toBe(true)
    expect(getTable(editor).childCount).toBe(4)
    expect(runRichTextAction(editor, addColumnBeforeAction)).toBe(true)
    expect(getTable(editor).firstChild?.childCount).toBe(3)
    expect(runRichTextAction(editor, addColumnAfterAction)).toBe(true)
    expect(getTable(editor).firstChild?.childCount).toBe(4)

    expect(runRichTextAction(editor, deleteRowAction)).toBe(true)
    expect(getTable(editor).childCount).toBe(3)
    expect(runRichTextAction(editor, deleteColumnAction)).toBe(true)
    expect(getTable(editor).firstChild?.childCount).toBe(3)
  })

  it('disables deleting the final row or column without deleting the table', () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 1, 1)

    expect(canRunRichTextAction(editor, deleteRowAction)).toBe(false)
    expect(canRunRichTextAction(editor, deleteColumnAction)).toBe(false)
    expect(canRunRichTextAction(editor, deleteTableAction)).toBe(true)
    expect(runRichTextAction(editor, deleteTableAction)).toBe(true)
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })
  })

  it('disables row and column deletion when a CellSelection covers the whole table', () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)

    const table = getSelectedTable(editor.state.selection)
    if (!table) {
      throw new Error('Expected a selected table')
    }

    const tableMap = TableMap.get(table.node)
    const tableStart = table.pos + 1
    const firstCell = editor.state.doc.resolve(tableStart + tableMap.map[0]!)
    const lastCell = editor.state.doc.resolve(tableStart + tableMap.map.at(-1)!)
    const selection = new CellSelection(firstCell, lastCell)
    editor.view.dispatch(editor.state.tr.setSelection(selection))

    expect(selection.isRowSelection()).toBe(true)
    expect(selection.isColSelection()).toBe(true)
    expect(canRunRichTextAction(editor, deleteRowAction)).toBe(false)
    expect(canRunRichTextAction(editor, deleteColumnAction)).toBe(false)
    expect(runRichTextAction(editor, deleteRowAction)).toBe(false)
    expect(runRichTextAction(editor, deleteColumnAction)).toBe(false)
    expect(getTable(editor).childCount).toBe(2)
    expect(TableMap.get(getTable(editor)).width).toBe(2)
  })

  it('toggles only the first row header semantics and preserves other header cells', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph' }] },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    })

    expect(toggleHeaderRowAction.isActive?.(editor)).toBe(false)
    expect(runRichTextAction(editor, toggleHeaderRowAction)).toBe(true)
    expect(toggleHeaderRowAction.isActive?.(editor)).toBe(true)
    expect(getTable(editor).firstChild?.firstChild?.type.name).toBe('tableHeader')
    expect(getTable(editor).child(1).firstChild?.type.name).toBe('tableHeader')

    expect(runRichTextAction(editor, toggleHeaderRowAction)).toBe(true)
    expect(toggleHeaderRowAction.isActive?.(editor)).toBe(false)
    expect(getTable(editor).child(1).firstChild?.type.name).toBe('tableHeader')
  })

  it('toggles the first column independently from the first row and preserves their intersection', () => {
    const editor = createTableEditor([
      [tableCell('tableCell', 'A'), tableCell('tableCell', 'B')],
      [tableCell('tableCell', 'C'), tableCell('tableCell', 'D')],
    ])

    editor.commands.setTextSelection(getTableCellPosition(editor, 1, 1) + 2)

    expect(toggleHeaderColumnAction.isActive?.(editor)).toBe(false)
    expect(runRichTextAction(editor, toggleHeaderColumnAction)).toBe(true)
    expect(toggleHeaderColumnAction.isActive?.(editor)).toBe(true)
    expect(toggleHeaderRowAction.isActive?.(editor)).toBe(false)
    expect(getTableCell(editor, 0, 0).type.name).toBe('tableHeader')
    expect(getTableCell(editor, 1, 0).type.name).toBe('tableHeader')
    expect(getTableCell(editor, 0, 1).type.name).toBe('tableCell')

    expect(runRichTextAction(editor, toggleHeaderRowAction)).toBe(true)
    expect(toggleHeaderColumnAction.isActive?.(editor)).toBe(true)
    expect(toggleHeaderRowAction.isActive?.(editor)).toBe(true)
    expect(getTableCell(editor, 0, 0).type.name).toBe('tableHeader')
    expect(getTableCell(editor, 0, 1).type.name).toBe('tableHeader')

    expect(runRichTextAction(editor, toggleHeaderColumnAction)).toBe(true)
    expect(toggleHeaderColumnAction.isActive?.(editor)).toBe(false)
    expect(toggleHeaderRowAction.isActive?.(editor)).toBe(true)
    expect(getTableCell(editor, 0, 0).type.name).toBe('tableHeader')
    expect(getTableCell(editor, 1, 0).type.name).toBe('tableCell')
  })

  it('keeps the native node-level header result for a merge spanning the header intersection', () => {
    const editor = createTableEditor([
      [tableCell('tableCell', 'A'), tableCell('tableCell', 'B')],
      [tableCell('tableCell', 'C'), tableCell('tableCell', 'D')],
    ])

    editor.commands.setTextSelection(getTableCellPosition(editor, 1, 1) + 2)
    expect(runRichTextAction(editor, toggleHeaderColumnAction)).toBe(true)
    expect(runRichTextAction(editor, toggleHeaderRowAction)).toBe(true)

    selectTableCells(editor, [0, 0], [1, 1])
    expect(runRichTextAction(editor, mergeCellsAction)).toBe(true)
    expect(getTableCell(editor, 0, 0).type.name).toBe('tableHeader')
    expect(toggleHeaderRowAction.isActive?.(editor)).toBe(true)
    expect(toggleHeaderColumnAction.isActive?.(editor)).toBe(true)

    const beforeToggle = editor.getJSON()

    expect(runRichTextAction(editor, toggleHeaderRowAction)).toBe(true)
    expect(editor.getJSON()).toEqual(beforeToggle)
    expect(toggleHeaderRowAction.isActive?.(editor)).toBe(true)
    expect(toggleHeaderColumnAction.isActive?.(editor)).toBe(true)

    expect(runRichTextAction(editor, toggleHeaderColumnAction)).toBe(true)
    expect(editor.getJSON()).toEqual(beforeToggle)
  })

  it('merges a rectangular selection with left-top attributes, ordered content, and logical widths', () => {
    const editor = createTableEditor([
      [
        tableCell('tableHeader', 'A', { align: 'right', colwidth: [120] }),
        tableCell('tableCell', 'B', { colwidth: [160] }),
      ],
      [
        tableCell('tableCell', 'C', { colwidth: [120] }),
        tableCell('tableCell', 'D', { colwidth: [160] }),
      ],
    ])

    selectTableCells(editor, [0, 0], [1, 1])

    expect(canRunRichTextAction(editor, mergeCellsAction)).toBe(true)
    expect(runRichTextAction(editor, mergeCellsAction)).toBe(true)

    const merged = getTableCell(editor, 0, 0)

    expect(merged.type.name).toBe('tableHeader')
    expect(merged.attrs).toMatchObject({
      colspan: 2,
      rowspan: 2,
      colwidth: [120, 160],
      align: 'right',
    })
    expect(merged.textContent).toBe('ABCD')
    expect(merged.childCount).toBe(4)
    expect(TableMap.get(getTable(editor)).problems).toBeNull()

    expect(editor.commands.undo()).toBe(true)
    expect(getTable(editor).child(0).childCount).toBe(2)
    expect(getTable(editor).child(1).childCount).toBe(2)
  })

  it('keeps auto columns null and restores zero-placeholder columns when splitting a rowspan', () => {
    const automatic = createTableEditor([
      [tableCell('tableCell', 'A'), tableCell('tableCell', 'B')],
    ])

    selectTableCells(automatic, [0, 0], [0, 1])
    expect(runRichTextAction(automatic, mergeCellsAction)).toBe(true)
    expect(getTableCell(automatic, 0, 0).attrs.colwidth).toBeNull()

    const partial = createTableEditor([
      [tableCell('tableCell', 'A', { colwidth: [120] }), tableCell('tableCell', 'B')],
      [tableCell('tableCell', 'C', { colwidth: [120] }), tableCell('tableCell', 'D')],
    ])

    selectTableCells(partial, [0, 0], [1, 1])
    expect(runRichTextAction(partial, mergeCellsAction)).toBe(true)
    expect(getTableCell(partial, 0, 0).attrs.colwidth).toEqual([120, 0])

    expect(runRichTextAction(partial, splitCellAction)).toBe(true)
    expect(getTableCell(partial, 0, 0).attrs.colwidth).toEqual([120])
    expect(getTableCell(partial, 0, 1).attrs.colwidth).toBeNull()
    expect(getTableCell(partial, 1, 0).attrs.colwidth).toEqual([120])
    expect(getTableCell(partial, 1, 1).attrs.colwidth).toBeNull()
  })

  it('rejects single-cell and boundary-cutting merge selections', () => {
    const singleCell = createTableEditor([
      [tableCell('tableCell', 'A'), tableCell('tableCell', 'B')],
    ])

    selectTableCells(singleCell, [0, 0], [0, 0])
    expect(canRunRichTextAction(singleCell, mergeCellsAction)).toBe(false)
    expect(runRichTextAction(singleCell, mergeCellsAction)).toBe(false)

    const boundaryCutting = createTableEditor([
      [tableCell('tableCell', 'A'), tableCell('tableCell', 'B'), tableCell('tableCell', 'C')],
      [tableCell('tableCell', 'D'), tableCell('tableCell', 'E', { colspan: 2 })],
      [tableCell('tableCell', 'F'), tableCell('tableCell', 'G'), tableCell('tableCell', 'H')],
    ])

    selectTableCells(boundaryCutting, [0, 0], [2, 1])
    expect(canRunRichTextAction(boundaryCutting, mergeCellsAction)).toBe(false)
    expect(runRichTextAction(boundaryCutting, mergeCellsAction)).toBe(false)
  })

  it('splits a merged cell with its type, alignment, and saved logical colwidth mapping', () => {
    const editor = createTableEditor([
      [
        tableCell('tableHeader', 'ABCD', {
          colspan: 2,
          rowspan: 2,
          align: 'right',
          colwidth: [120, 160],
        }),
      ],
      [],
    ])

    selectTableCells(editor, [0, 0], [0, 0])
    expect(canRunRichTextAction(editor, splitCellAction)).toBe(true)
    expect(runRichTextAction(editor, splitCellAction)).toBe(true)

    for (const [row, column, colwidth] of [
      [0, 0, [120]],
      [0, 1, [160]],
      [1, 0, [120]],
      [1, 1, [160]],
    ] as const) {
      const cell = getTableCell(editor, row, column)

      expect(cell.type.name).toBe('tableHeader')
      expect(cell.attrs).toMatchObject({ colspan: 1, rowspan: 1, colwidth, align: 'right' })
    }

    expect(getTableCell(editor, 0, 0).textContent).toBe('ABCD')
    expect(getTableCell(editor, 0, 1).textContent).toBe('')

    const selection = editor.state.selection

    expect(selection).toBeInstanceOf(CellSelection)

    if (!(selection instanceof CellSelection)) {
      throw new Error('Expected a CellSelection after splitting')
    }

    const selectedPositions: number[] = []
    selection.forEachCell((_cell, position) => selectedPositions.push(position))

    expect(selectedPositions.sort((first, second) => first - second)).toEqual(
      [
        getTableCellPosition(editor, 0, 0),
        getTableCellPosition(editor, 0, 1),
        getTableCellPosition(editor, 1, 0),
        getTableCellPosition(editor, 1, 1),
      ].sort((first, second) => first - second),
    )

    expect(editor.commands.undo()).toBe(true)
    expect(getTableCell(editor, 0, 0).attrs).toMatchObject({
      colspan: 2,
      rowspan: 2,
      colwidth: [120, 160],
      align: 'right',
    })
  })

  it('normalizes mixed header-cell selections and reverses an all-header selection', () => {
    const editor = createTableEditor([[tableCell('tableHeader', 'A'), tableCell('tableCell', 'B')]])

    selectTableCells(editor, [0, 0], [0, 1])

    expect(toggleHeaderCellAction.isActive?.(editor)).toBe(false)
    expect(canRunRichTextAction(editor, toggleHeaderCellAction)).toBe(true)
    expect(runRichTextAction(editor, toggleHeaderCellAction)).toBe(true)
    expect(getTableCell(editor, 0, 0).type.name).toBe('tableHeader')
    expect(getTableCell(editor, 0, 1).type.name).toBe('tableHeader')
    expect(toggleHeaderCellAction.isActive?.(editor)).toBe(true)

    expect(runRichTextAction(editor, toggleHeaderCellAction)).toBe(true)
    expect(getTableCell(editor, 0, 0).type.name).toBe('tableCell')
    expect(getTableCell(editor, 0, 1).type.name).toBe('tableCell')
  })

  it('uses cursors and same-cell text selections as targets but rejects ordinary cross-cell text selections', () => {
    const editor = createTableEditor([[tableCell('tableCell', 'AA'), tableCell('tableCell', 'BB')]])
    const firstCellPosition = getTableCellPosition(editor, 0, 0)
    const secondCellPosition = getTableCellPosition(editor, 0, 1)

    editor.commands.setTextSelection({ from: firstCellPosition + 2, to: firstCellPosition + 2 })
    expect(canRunRichTextAction(editor, toggleHeaderCellAction)).toBe(true)
    expect(runRichTextAction(editor, toggleHeaderCellAction)).toBe(true)
    expect(getTableCell(editor, 0, 0).type.name).toBe('tableHeader')

    editor.commands.setTextSelection({ from: firstCellPosition + 2, to: firstCellPosition + 3 })
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(canRunRichTextAction(editor, setCellAlignAction, 'left')).toBe(true)
    expect(runRichTextAction(editor, setCellAlignAction, 'left')).toBe(true)
    expect(getTableCell(editor, 0, 0).attrs.align).toBe('left')
    expect(getTableCell(editor, 0, 1).attrs.align).toBeNull()

    editor.commands.setTextSelection({ from: firstCellPosition + 3, to: secondCellPosition + 3 })
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(canRunRichTextAction(editor, toggleHeaderCellAction)).toBe(false)
    expect(canRunRichTextAction(editor, setCellAlignAction, 'center')).toBe(false)
    expect(runRichTextAction(editor, setCellAlignAction, 'center')).toBe(false)
  })

  it('normalizes cell alignment across a selection without relying on the anchor value', () => {
    const editor = createTableEditor([
      [
        tableCell('tableCell', 'A', { align: 'center' }),
        tableCell('tableCell', 'B', { align: null }),
      ],
    ])

    selectTableCells(editor, [0, 0], [0, 1])

    expect(setCellAlignAction.isActive?.(editor, 'center')).toBe(false)
    expect(setCellAlignAction.isActive?.(editor, null)).toBe(false)
    expect(canRunRichTextAction(editor, setCellAlignAction, 'center')).toBe(true)
    expect(runRichTextAction(editor, setCellAlignAction, 'center')).toBe(true)
    expect(getTableCell(editor, 0, 0).attrs.align).toBe('center')
    expect(getTableCell(editor, 0, 1).attrs.align).toBe('center')
    expect(setCellAlignAction.isActive?.(editor, 'center')).toBe(true)
    expect(canRunRichTextAction(editor, setCellAlignAction, 'center')).toBe(false)

    for (const alignment of ['left', 'right', null] as const) {
      expect(runRichTextAction(editor, setCellAlignAction, alignment)).toBe(true)
      expect(getTableCell(editor, 0, 0).attrs.align).toBe(alignment)
      expect(getTableCell(editor, 0, 1).attrs.align).toBe(alignment)
      expect(setCellAlignAction.isActive?.(editor, alignment)).toBe(true)
      expect(canRunRichTextAction(editor, setCellAlignAction, alignment)).toBe(false)
    }
  })

  it('does not clear an explicit paragraph alignment when changing the cell alignment', () => {
    const editor = createTestEditor({
      extensions: [
        Document,
        Paragraph,
        Text,
        TextAlign.configure({ types: ['paragraph'] }),
        UndoRedo,
        ...tableFeature.sharedExtensions!(),
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    ...tableCell('tableCell', 'A'),
                    content: [
                      {
                        type: 'paragraph',
                        attrs: { textAlign: 'right' },
                        content: [{ type: 'text', text: 'A' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    editor.commands.setTextSelection(getTableCellPosition(editor, 0, 0) + 2)
    expect(runRichTextAction(editor, setCellAlignAction, 'left')).toBe(true)
    expect(getTableCell(editor, 0, 0).firstChild?.attrs.textAlign).toBe('right')
  })

  it('finds the table for cursor, text, and cell selections', () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)

    const table = getSelectedTable(editor.state.selection)
    expect(table?.node.type.name).toBe('table')

    if (!table) {
      throw new Error('Expected a selected table')
    }

    const tableMap = TableMap.get(table.node)
    const tableStart = table.pos + 1
    const firstCellPosition = tableStart + tableMap.map[0]!

    editor.commands.setTextSelection({ from: firstCellPosition + 2, to: firstCellPosition + 3 })
    expect(getSelectedTable(editor.state.selection)).not.toBeNull()

    const firstCell = editor.state.doc.resolve(firstCellPosition)
    const secondCell = editor.state.doc.resolve(tableStart + tableMap.map[1]!)
    editor.view.dispatch(editor.state.tr.setSelection(new CellSelection(firstCell, secondCell)))
    expect(getSelectedTable(editor.state.selection)).not.toBeNull()
  })

  it('keeps native table keyboard navigation and history undo available', () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 1, 1)
    expect(editor.commands.goToNextCell()).toBe(false)
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })
  })
})
