import type { Attributes } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { defineRichTextFeature } from '../../core/feature'
import { baseFeature } from '../base/shared'

export type RichTextTableInsertDimension = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface RichTextInsertTableOptions {
  rows: RichTextTableInsertDimension
  cols: RichTextTableInsertDimension
  withHeaderRow: boolean
}

export const richTextTableMaximumRows = 100
export const richTextTableMaximumColumns = 100

export function renderRichTextTableText(table: ProseMirrorNode) {
  const rows: string[] = []

  table.forEach((row) => {
    const cells: string[] = []

    row.forEach((cell) => {
      cells.push(cell.textBetween(0, cell.content.size, '\n'))
    })

    rows.push(cells.join('\t'))
  })

  return rows.join('\n')
}

type RichTextTableSpanAttribute = 'colspan' | 'rowspan'

function validateTableSpan(value: unknown, maximum: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError('Invalid rich text table cell span')
  }
}

function validateTableColumnSpan(value: unknown) {
  validateTableSpan(value, richTextTableMaximumColumns)
}

function validateTableRowSpan(value: unknown) {
  validateTableSpan(value, richTextTableMaximumRows)
}

function validateUnusedTableCellAttribute(value: unknown) {
  if (value !== null) {
    throw new RangeError('Unsupported rich text table cell attribute')
  }
}

function parseTableSpan(value: string | null, maximum: number) {
  if (!value || !/^[1-9]\d{0,2}$/.test(value)) {
    return 1
  }

  const span = Number(value)

  return span <= maximum ? span : 1
}

export function normalizeRichTextTableColumnSpan(value: string | null) {
  return parseTableSpan(value, richTextTableMaximumColumns)
}

export function normalizeRichTextTableRowSpan(value: string | null) {
  return parseTableSpan(value, richTextTableMaximumRows)
}

function renderTableSpan(
  attributes: Record<string, unknown>,
  attribute: RichTextTableSpanAttribute,
) {
  const span = attributes[attribute]
  validateTableSpan(
    span,
    attribute === 'colspan' ? richTextTableMaximumColumns : richTextTableMaximumRows,
  )

  return span === 1 ? {} : { [attribute]: String(span) }
}

export function createRichTextTableCellAttributes(): Attributes {
  return {
    colspan: {
      default: 1,
      validate: validateTableColumnSpan,
      parseHTML: (element) => normalizeRichTextTableColumnSpan(element.getAttribute('colspan')),
      renderHTML: (attributes: Record<string, unknown>) => renderTableSpan(attributes, 'colspan'),
    },
    rowspan: {
      default: 1,
      validate: validateTableRowSpan,
      parseHTML: (element) => normalizeRichTextTableRowSpan(element.getAttribute('rowspan')),
      renderHTML: (attributes: Record<string, unknown>) => renderTableSpan(attributes, 'rowspan'),
    },
    colwidth: {
      default: null,
      validate: validateUnusedTableCellAttribute,
      parseHTML: () => null,
      renderHTML: () => ({}),
    },
    align: {
      default: null,
      validate: validateUnusedTableCellAttribute,
      parseHTML: () => null,
      renderHTML: () => ({}),
    },
  }
}

export const tableFeature = defineRichTextFeature({
  key: 'table',
  editorImplementation: true,
  serverImplementation: true,
  dependencies: [baseFeature],
})
