import { mergeAttributes, type Attributes } from '@tiptap/core'
import type { DOMOutputSpec, Node as ProseMirrorNode } from '@tiptap/pm/model'
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

function collectColumnWidths(table: ProseMirrorNode) {
  const firstRow = table.firstChild

  if (!firstRow) {
    return []
  }

  const widths: Array<number | undefined> = []

  for (let cellIndex = 0; cellIndex < firstRow.childCount; cellIndex += 1) {
    const { colspan, colwidth } = firstRow.child(cellIndex).attrs as {
      colspan: number
      colwidth: number[] | null
    }

    for (let columnIndex = 0; columnIndex < colspan; columnIndex += 1) {
      widths.push(colwidth?.[columnIndex] || undefined)
    }
  }

  return widths
}

const RichTextTable = Table.extend({
  renderHTML({ node, HTMLAttributes }) {
    const columnWidths = collectColumnWidths(node)
    const hasFixedColumn = columnWidths.some((width) => width !== undefined)
    const hasOnlyFixedColumns = columnWidths.every((width) => width !== undefined)
    const tableWidth = columnWidths.reduce<number>(
      (total, width) => total + (width ?? TABLE_CELL_MIN_WIDTH),
      0,
    )
    const colgroup: DOMOutputSpec | null = hasFixedColumn
      ? [
          'colgroup',
          {},
          ...columnWidths.map<DOMOutputSpec>((width) =>
            width === undefined
              ? ['col', {}]
              : ['col', { style: `width: ${Math.max(width, TABLE_CELL_MIN_WIDTH)}px` }],
          ),
        ]
      : null
    const table: DOMOutputSpec = [
      'table',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        ...(hasFixedColumn
          ? { style: `${hasOnlyFixedColumns ? 'width' : 'min-width'}: ${tableWidth}px` }
          : {}),
      }),
      ...(colgroup ? [colgroup] : []),
      ['tbody', 0],
    ]

    return this.options.renderWrapper ? ['div', { class: 'tableWrapper' }, table] : table
  },
})

export const tableFeature = defineRichTextFeature({
  key: 'table',
  editorImplementation: true,
  serverImplementation: true,
  sharedExtensions: () => [
    RichTextTable.configure({
      resizable: false,
      renderWrapper: true,
      cellMinWidth: TABLE_CELL_MIN_WIDTH,
    }),
    TableRow,
    RichTextTableCell,
    RichTextTableHeader,
  ],
})
