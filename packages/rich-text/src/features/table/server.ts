import { Node, type AnyExtension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/policy'
import {
  createRichTextTableCellAttributes,
  normalizeRichTextTableColumnSpan,
  normalizeRichTextTableRowSpan,
  renderRichTextTableText,
  richTextTableMaximumColumns,
  richTextTableMaximumRows,
  tableFeature,
} from './shared'

const ServerTable = Node.create({
  name: 'table',
  content: 'tableRow+',
  group: 'block',
  isolating: true,
  parseHTML() {
    return [{ tag: 'table' }]
  },
  renderHTML() {
    return ['table', ['tbody', 0]]
  },
  renderText({ node }) {
    return renderRichTextTableText(node)
  },
})

const ServerTableRow = Node.create({
  name: 'tableRow',
  content: '(tableCell | tableHeader)*',
  parseHTML() {
    return [{ tag: 'tr' }]
  },
  renderHTML() {
    return ['tr', 0]
  },
})

function createServerTableCell(name: 'tableCell' | 'tableHeader', tag: 'td' | 'th') {
  return Node.create({
    name,
    content: 'block+',
    isolating: true,
    addAttributes: createRichTextTableCellAttributes,
    parseHTML() {
      return [{ tag }]
    },
    renderHTML({ HTMLAttributes }) {
      return [tag, HTMLAttributes, 0]
    },
  })
}

const ServerTableCell = createServerTableCell('tableCell', 'td')
const ServerTableHeader = createServerTableCell('tableHeader', 'th')

function normalizeTableCellTag({ tagName, attribs }: Parameters<RichTextTagTransform>[0]) {
  const colspan = normalizeRichTextTableColumnSpan(attribs.colspan ?? null)
  const rowspan = normalizeRichTextTableRowSpan(attribs.rowspan ?? null)

  return {
    tagName,
    attribs: {
      ...(colspan === 1 ? {} : { colspan: String(colspan) }),
      ...(rowspan === 1 ? {} : { rowspan: String(rowspan) }),
    },
  }
}

const normalizeTableCell: RichTextTagTransform = normalizeTableCellTag

export const tableHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['table', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: {
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  transformTags: {
    th: [normalizeTableCell],
    td: [normalizeTableCell],
  },
}

function validateTableCell(cell: ProseMirrorNode) {
  if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') {
    throw new RangeError('Invalid rich text table cell')
  }

  const { colspan, rowspan, colwidth, align } = cell.attrs

  if (
    typeof colspan !== 'number' ||
    !Number.isInteger(colspan) ||
    colspan < 1 ||
    colspan > richTextTableMaximumColumns ||
    typeof rowspan !== 'number' ||
    !Number.isInteger(rowspan) ||
    rowspan < 1 ||
    rowspan > richTextTableMaximumRows ||
    colwidth !== null ||
    align !== null
  ) {
    throw new RangeError('Invalid rich text table cell attributes')
  }

  return { colspan, rowspan }
}

function validateTable(table: ProseMirrorNode) {
  const rowCount = table.childCount

  if (rowCount < 1 || rowCount > richTextTableMaximumRows) {
    throw new RangeError('Invalid rich text table height')
  }

  const occupied = Array.from({ length: rowCount }, () => [] as boolean[])

  table.forEach((row, _offset, rowIndex) => {
    if (row.type.name !== 'tableRow') {
      throw new RangeError('Invalid rich text table row')
    }

    let columnIndex = 0

    row.forEach((cell) => {
      while (occupied[rowIndex]![columnIndex]) {
        columnIndex += 1
      }

      const { colspan, rowspan } = validateTableCell(cell)

      if (columnIndex + colspan > richTextTableMaximumColumns || rowIndex + rowspan > rowCount) {
        throw new RangeError('Rich text table cell span is out of bounds')
      }

      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
          const targetRow = occupied[rowIndex + rowOffset]!
          const targetColumn = columnIndex + columnOffset

          if (targetRow[targetColumn]) {
            throw new RangeError('Rich text table cells overlap')
          }

          targetRow[targetColumn] = true
        }
      }

      columnIndex += colspan
    })
  })

  const columnCount = Math.max(...occupied.map((row) => row.length))

  if (columnCount < 1 || columnCount > richTextTableMaximumColumns) {
    throw new RangeError('Invalid rich text table width')
  }

  for (const row of occupied) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      if (!row[columnIndex]) {
        throw new RangeError('Rich text table has an empty cell position')
      }
    }
  }
}

export function validateRichTextTables(document: ProseMirrorNode) {
  document.descendants((node) => {
    if (node.type.name === 'table') {
      validateTable(node)
    }
  })
}

export const tableServerFeature = defineRichTextServerFeature(tableFeature, {
  extensions: (): readonly AnyExtension[] => [
    ServerTable,
    ServerTableCell,
    ServerTableHeader,
    ServerTableRow,
  ],
  htmlPolicy: tableHtmlPolicy,
  validateDocument: validateRichTextTables,
})
