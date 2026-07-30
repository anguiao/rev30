import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
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
  tableEditorFeature,
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
