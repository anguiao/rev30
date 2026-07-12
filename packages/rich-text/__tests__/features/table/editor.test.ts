import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
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
  tableEditorFeature,
  toggleTableHeaderRowAction,
} from '../../../src/features/table/editor'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string | object = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...tableEditorFeature.extensions!()],
    content,
  })
}

function getTable(editor: ReturnType<typeof createEditor>) {
  return editor.state.doc.firstChild!
}

function getCellPositions(editor: ReturnType<typeof createEditor>) {
  const positions: number[] = []

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      positions.push(position)
    }
  })

  return positions
}

function createTableDocument(rowCount: number, columnCount: number) {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: Array.from({ length: rowCount }, () => ({
          type: 'tableRow',
          content: Array.from({ length: columnCount }, () => ({
            type: 'tableCell',
            content: [{ type: 'paragraph' }],
          })),
        })),
      },
    ],
  }
}

describe('table editor feature', () => {
  it('exposes the eleven direct table actions', () => {
    expect(tableEditorFeature.actions).toEqual([
      insertTableAction,
      addTableRowBeforeAction,
      addTableRowAfterAction,
      deleteTableRowAction,
      addTableColumnBeforeAction,
      addTableColumnAfterAction,
      deleteTableColumnAction,
      deleteTableAction,
      mergeTableCellsAction,
      splitTableCellAction,
      toggleTableHeaderRowAction,
    ])
  })

  it('inserts a table and applies row, column, header, and delete actions', () => {
    const editor = createEditor()
    const options = { rows: 2, cols: 2, withHeaderRow: true } as const

    expect(insertTableAction.canRun?.(editor, options)).toBe(true)
    expect(insertTableAction.run(editor, options)).toBe(true)
    expect(getTable(editor).childCount).toBe(2)
    expect(getTable(editor).firstChild?.firstChild?.type.name).toBe('tableHeader')
    expect(editor.getHTML()).not.toContain('colgroup')

    expect(toggleTableHeaderRowAction.run(editor)).toBe(true)
    expect(getTable(editor).firstChild?.firstChild?.type.name).toBe('tableCell')

    expect(addTableRowAfterAction.run(editor)).toBe(true)
    expect(addTableRowBeforeAction.run(editor)).toBe(true)
    expect(deleteTableRowAction.run(editor)).toBe(true)
    expect(getTable(editor).childCount).toBe(3)

    expect(addTableColumnAfterAction.run(editor)).toBe(true)
    expect(addTableColumnBeforeAction.run(editor)).toBe(true)
    expect(deleteTableColumnAction.run(editor)).toBe(true)
    expect(getTable(editor).firstChild?.childCount).toBe(3)

    expect(deleteTableAction.run(editor)).toBe(true)
    expect(editor.isActive('table')).toBe(false)
  })

  it('rejects inserting a nested table', () => {
    const editor = createEditor()
    const options = { rows: 2, cols: 2, withHeaderRow: true } as const

    expect(insertTableAction.run(editor, options)).toBe(true)
    expect(insertTableAction.canRun?.(editor, options)).toBe(false)
    expect(insertTableAction.run(editor, options)).toBe(false)
  })

  it('merges and splits an explicit cell selection', () => {
    const editor = createEditor()
    expect(insertTableAction.run(editor, { rows: 2, cols: 2, withHeaderRow: false })).toBe(true)

    const [firstCell, secondCell] = getCellPositions(editor)
    expect(
      editor.commands.setCellSelection({ anchorCell: firstCell!, headCell: secondCell! }),
    ).toBe(true)
    expect(mergeTableCellsAction.canRun?.(editor)).toBe(true)
    expect(mergeTableCellsAction.run(editor)).toBe(true)
    expect(getTable(editor).firstChild?.firstChild?.attrs.colspan).toBe(2)

    expect(splitTableCellAction.canRun?.(editor)).toBe(true)
    expect(splitTableCellAction.run(editor)).toBe(true)
    expect(getTable(editor).firstChild?.childCount).toBe(2)
  })

  it('keeps native Tab navigation and adds a row after the final cell', () => {
    const editor = createEditor()
    expect(insertTableAction.run(editor, { rows: 1, cols: 2, withHeaderRow: false })).toBe(true)

    editor.commands.setTextSelection(getCellPositions(editor)[1]! + 2)
    editor.commands.keyboardShortcut('Tab')
    expect(getTable(editor).childCount).toBe(2)
  })

  it('does not add a row beyond the server limit, including with Tab', () => {
    const editor = createEditor(createTableDocument(100, 1))
    const lastCell = getCellPositions(editor).at(-1)!
    editor.commands.setTextSelection(lastCell + 2)

    expect(addTableRowBeforeAction.canRun?.(editor)).toBe(false)
    expect(addTableRowAfterAction.canRun?.(editor)).toBe(false)
    expect(addTableRowBeforeAction.run(editor)).toBe(false)
    expect(addTableRowAfterAction.run(editor)).toBe(false)
    editor.commands.setTextSelection(lastCell + 2)
    editor.commands.keyboardShortcut('Tab')
    expect(getTable(editor).childCount).toBe(100)
  })

  it('does not add a column beyond the server limit', () => {
    const editor = createEditor(createTableDocument(1, 100))
    const lastCell = getCellPositions(editor).at(-1)!
    editor.commands.setTextSelection(lastCell + 2)

    expect(addTableColumnBeforeAction.canRun?.(editor)).toBe(false)
    expect(addTableColumnAfterAction.canRun?.(editor)).toBe(false)
    expect(addTableColumnBeforeAction.run(editor)).toBe(false)
    expect(addTableColumnAfterAction.run(editor)).toBe(false)
    expect(getTable(editor).firstChild?.childCount).toBe(100)
  })

  it('imports table HTML with canonical cell attributes', () => {
    const editor = createEditor()

    expect(
      editor.commands.setContent(
        '<table><tbody><tr><th colspan="2"><p>标题</p></th></tr><tr><td><p>甲</p></td><td><p>乙</p></td></tr></tbody></table>',
      ),
    ).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'table',
          content: [
            {
              content: [{ type: 'tableHeader', attrs: { colspan: 2, rowspan: 1 } }],
            },
            {
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 } },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 } },
              ],
            },
          ],
        },
      ],
    })
  })
})
