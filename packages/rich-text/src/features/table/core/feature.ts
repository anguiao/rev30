import type { Attributes } from '@tiptap/core'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { defineRichTextFeature } from '../../../core/feature'
import {
  isValidTableCellAlign,
  isValidTableCellSpan,
  isValidTableColwidth,
  normalizeTableCellAlign,
  normalizeTableCellSpan,
  normalizeTableColwidth,
} from './attrs'

const TABLE_CELL_MIN_WIDTH = 96

function validateTableCellSpan(value: unknown) {
  if (!isValidTableCellSpan(value)) {
    throw new RangeError(
      'Table cell spans must be positive safe integers within the per-table grid slot limit',
    )
  }
}

function validateColwidth(value: unknown) {
  if (value === null) {
    return
  }

  if (!isValidTableColwidth(value)) {
    throw new RangeError('Table cell colwidth must be null or an array of numbers')
  }
}

function validateCellAlign(value: unknown) {
  if (value !== null && !isValidTableCellAlign(value)) {
    throw new RangeError('Unsupported table cell alignment')
  }
}

function createTableCellAttributes(parentAttributes: Attributes): Attributes {
  return {
    ...parentAttributes,
    colspan: {
      ...parentAttributes.colspan,
      parseHTML: (element) => normalizeTableCellSpan(element.getAttribute('colspan')),
      validate: validateTableCellSpan,
    },
    rowspan: {
      ...parentAttributes.rowspan,
      parseHTML: (element) => normalizeTableCellSpan(element.getAttribute('rowspan')),
      validate: validateTableCellSpan,
    },
    colwidth: {
      ...parentAttributes.colwidth,
      parseHTML: (element) =>
        normalizeTableColwidth(
          element.hasAttribute('colwidth')
            ? element.getAttribute('colwidth')
            : parentAttributes.colwidth?.parseHTML?.(element),
        ),
      validate: validateColwidth,
    },
    align: {
      ...parentAttributes.align,
      parseHTML: (element) => normalizeTableCellAlign(parentAttributes.align?.parseHTML?.(element)),
      validate: validateCellAlign,
    },
  }
}

const RichTextTableCell = TableCell.extend({
  content: 'paragraph+',

  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}

    return createTableCellAttributes(parentAttributes)
  },
})

const RichTextTableHeader = TableHeader.extend({
  content: 'paragraph+',

  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}

    return createTableCellAttributes(parentAttributes)
  },
})

export const tableFeature = defineRichTextFeature({
  key: 'table',
  editorImplementation: true,
  serverImplementation: true,
  sharedExtensions: () => [
    Table.configure({
      resizable: true,
      renderWrapper: true,
      cellMinWidth: TABLE_CELL_MIN_WIDTH,
      lastColumnResizable: true,
    }),
    TableRow,
    RichTextTableCell,
    RichTextTableHeader,
  ],
})
