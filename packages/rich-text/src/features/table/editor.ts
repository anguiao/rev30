import { TableCell } from '@tiptap/extension-table/cell'
import { TableHeader } from '@tiptap/extension-table/header'
import { TableRow } from '@tiptap/extension-table/row'
import { Table } from '@tiptap/extension-table/table'
import {
  addColumnAfter as addColumnAfterCommand,
  addColumnBefore as addColumnBeforeCommand,
  addRowAfter as addRowAfterCommand,
  addRowBefore as addRowBeforeCommand,
  findTable,
  TableMap,
} from '@tiptap/pm/tables'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import {
  createRichTextTableCellAttributes,
  renderRichTextTableText,
  richTextTableMaximumColumns,
  richTextTableMaximumRows,
  tableFeature,
  type RichTextInsertTableOptions,
} from './shared'

const RichTextTable = Table.extend({
  addCommands() {
    return {
      ...(this.parent?.() ?? {}),
      addRowBefore:
        () =>
        ({ state, dispatch }) => {
          const table = findTable(state.selection.$from)

          return (
            table !== null &&
            table.node.childCount < richTextTableMaximumRows &&
            addRowBeforeCommand(state, dispatch)
          )
        },
      addRowAfter:
        () =>
        ({ state, dispatch }) => {
          const table = findTable(state.selection.$from)

          return (
            table !== null &&
            table.node.childCount < richTextTableMaximumRows &&
            addRowAfterCommand(state, dispatch)
          )
        },
      addColumnBefore:
        () =>
        ({ state, dispatch }) => {
          const table = findTable(state.selection.$from)

          return (
            table !== null &&
            TableMap.get(table.node).width < richTextTableMaximumColumns &&
            addColumnBeforeCommand(state, dispatch)
          )
        },
      addColumnAfter:
        () =>
        ({ state, dispatch }) => {
          const table = findTable(state.selection.$from)

          return (
            table !== null &&
            TableMap.get(table.node).width < richTextTableMaximumColumns &&
            addColumnAfterCommand(state, dispatch)
          )
        },
    }
  },
  renderHTML({ HTMLAttributes }) {
    return ['table', HTMLAttributes, ['tbody', 0]]
  },
  renderText({ node }) {
    return renderRichTextTableText(node)
  },
}).configure({
  resizable: false,
  allowTableNodeSelection: false,
})

const RichTextTableCell = TableCell.extend({
  addAttributes: createRichTextTableCellAttributes,
})

const RichTextTableHeader = TableHeader.extend({
  addAttributes: createRichTextTableCellAttributes,
})

export const insertTableAction = defineRichTextAction(tableFeature, {
  key: 'insert-table',
  run: (editor, options: RichTextInsertTableOptions) =>
    !editor.isActive('table') && editor.chain().focus().insertTable(options).run(),
  canRun: (editor, options: RichTextInsertTableOptions) =>
    !editor.isActive('table') && editor.can().chain().focus().insertTable(options).run(),
})

export const addTableRowBeforeAction = defineRichTextAction(tableFeature, {
  key: 'add-table-row-before',
  run: (editor) => editor.chain().focus().addRowBefore().run(),
  canRun: (editor) => editor.can().chain().focus().addRowBefore().run(),
})

export const addTableRowAfterAction = defineRichTextAction(tableFeature, {
  key: 'add-table-row-after',
  run: (editor) => editor.chain().focus().addRowAfter().run(),
  canRun: (editor) => editor.can().chain().focus().addRowAfter().run(),
})

export const deleteTableRowAction = defineRichTextAction(tableFeature, {
  key: 'delete-table-row',
  run: (editor) => editor.chain().focus().deleteRow().run(),
  canRun: (editor) => editor.can().chain().focus().deleteRow().run(),
})

export const addTableColumnBeforeAction = defineRichTextAction(tableFeature, {
  key: 'add-table-column-before',
  run: (editor) => editor.chain().focus().addColumnBefore().run(),
  canRun: (editor) => editor.can().chain().focus().addColumnBefore().run(),
})

export const addTableColumnAfterAction = defineRichTextAction(tableFeature, {
  key: 'add-table-column-after',
  run: (editor) => editor.chain().focus().addColumnAfter().run(),
  canRun: (editor) => editor.can().chain().focus().addColumnAfter().run(),
})

export const deleteTableColumnAction = defineRichTextAction(tableFeature, {
  key: 'delete-table-column',
  run: (editor) => editor.chain().focus().deleteColumn().run(),
  canRun: (editor) => editor.can().chain().focus().deleteColumn().run(),
})

export const deleteTableAction = defineRichTextAction(tableFeature, {
  key: 'delete-table',
  run: (editor) => editor.chain().focus().deleteTable().run(),
  canRun: (editor) => editor.can().chain().focus().deleteTable().run(),
})

export const mergeTableCellsAction = defineRichTextAction(tableFeature, {
  key: 'merge-table-cells',
  run: (editor) => editor.chain().focus().mergeCells().run(),
  canRun: (editor) => editor.can().chain().focus().mergeCells().run(),
})

export const splitTableCellAction = defineRichTextAction(tableFeature, {
  key: 'split-table-cell',
  run: (editor) => editor.chain().focus().splitCell().run(),
  canRun: (editor) => editor.can().chain().focus().splitCell().run(),
})

export const toggleTableHeaderRowAction = defineRichTextAction(tableFeature, {
  key: 'toggle-table-header-row',
  run: (editor) => editor.chain().focus().toggleHeaderRow().run(),
  canRun: (editor) => editor.can().chain().focus().toggleHeaderRow().run(),
})

export const tableEditorFeature = defineRichTextEditorFeature(tableFeature, {
  extensions: () => [RichTextTable, RichTextTableCell, RichTextTableHeader, TableRow],
})
