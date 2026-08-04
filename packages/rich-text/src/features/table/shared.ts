import type { Attributes } from '@tiptap/core'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { defineRichTextFeature } from '../../core/feature'

const TABLE_CELL_MIN_WIDTH = 96

function validatePositiveInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RangeError('Table cell spans must be positive integers')
  }
}

function validateColwidth(value: unknown) {
  if (value === null) {
    return
  }

  if (
    !Array.isArray(value) ||
    value.some((width) => typeof width !== 'number' || !Number.isFinite(width))
  ) {
    throw new RangeError('Table cell colwidth must be null or an array of numbers')
  }
}

function validateCellAlign(value: unknown) {
  if (value !== null && value !== 'left' && value !== 'center' && value !== 'right') {
    throw new RangeError('Unsupported table cell alignment')
  }
}

const RichTextTableCell = TableCell.extend({
  content: 'paragraph+',

  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}

    return {
      ...parentAttributes,
      colspan: {
        ...parentAttributes.colspan,
        validate: validatePositiveInteger,
      },
      rowspan: {
        ...parentAttributes.rowspan,
        validate: validatePositiveInteger,
      },
      colwidth: {
        ...parentAttributes.colwidth,
        validate: validateColwidth,
      },
      align: {
        ...parentAttributes.align,
        validate: validateCellAlign,
      },
    }
  },
})

const RichTextTableHeader = TableHeader.extend({
  content: 'paragraph+',

  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}

    return {
      ...parentAttributes,
      colspan: {
        ...parentAttributes.colspan,
        validate: validatePositiveInteger,
      },
      rowspan: {
        ...parentAttributes.rowspan,
        validate: validatePositiveInteger,
      },
      colwidth: {
        ...parentAttributes.colwidth,
        validate: validateColwidth,
      },
      align: {
        ...parentAttributes.align,
        validate: validateCellAlign,
      },
    }
  },
})

export const tableFeature = defineRichTextFeature({
  key: 'table',
  editorImplementation: true,
  serverImplementation: true,
  sharedExtensions: () => [
    Table.configure({
      resizable: false,
      renderWrapper: true,
      cellMinWidth: TABLE_CELL_MIN_WIDTH,
    }),
    TableRow,
    RichTextTableCell,
    RichTextTableHeader,
  ],
})
