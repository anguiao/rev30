import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TableMap } from '@tiptap/pm/tables'
import { RichTextDocumentInvalidError } from '../../server/errors'
import { defineRichTextServerFeature } from '../../server/feature'
import {
  getInlineStyleValue,
  type RichTextHtmlPolicy,
  type RichTextTagTransform,
} from '../../server/sanitize'
import { tableFeature } from './shared'
import {
  buildRichTextTableCellStyle,
  buildRichTextTableHeaderStyle,
  buildRichTextTableStyle,
  richTextTableWrapperStyle,
} from './styles'

const TABLE_MAX_GRID_SLOTS_PER_TABLE = 10_000
const TABLE_MAX_GRID_SLOTS_PER_DOCUMENT = 100_000

const pixelValuePattern = /^\s*\d+(?:\.\d+)?px\s*$/
const positiveIntegerPattern = /^[1-9]\d*$/
const colwidthPattern = /^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?)*$/

function getTableGridSlotCount(table: ProseMirrorNode) {
  const rowCount = table.childCount
  const maximumAllowedColumnCount = Math.floor(TABLE_MAX_GRID_SLOTS_PER_TABLE / rowCount)
  const rowspanColumnCountsByEndRow = new Map<number, number>()
  let activeRowspanColumnCount = 0
  let maximumRowColumnCount = 0

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    activeRowspanColumnCount -= rowspanColumnCountsByEndRow.get(rowIndex) ?? 0
    rowspanColumnCountsByEndRow.delete(rowIndex)

    if (activeRowspanColumnCount > maximumAllowedColumnCount) {
      throw new RichTextDocumentInvalidError('Table exceeds the grid slot limit')
    }

    let rowColumnCount = activeRowspanColumnCount
    const row = table.child(rowIndex)

    for (let cellIndex = 0; cellIndex < row.childCount; cellIndex += 1) {
      const { colspan, rowspan } = row.child(cellIndex).attrs as {
        colspan: number
        rowspan: number
      }

      if (colspan > maximumAllowedColumnCount - rowColumnCount) {
        throw new RichTextDocumentInvalidError('Table exceeds the grid slot limit')
      }

      rowColumnCount += colspan

      if (rowspan > 1) {
        activeRowspanColumnCount += colspan

        if (rowspan < rowCount - rowIndex) {
          const endRowIndex = rowIndex + rowspan

          rowspanColumnCountsByEndRow.set(
            endRowIndex,
            (rowspanColumnCountsByEndRow.get(endRowIndex) ?? 0) + colspan,
          )
        }
      }
    }

    maximumRowColumnCount = Math.max(maximumRowColumnCount, rowColumnCount)
  }

  return maximumRowColumnCount * rowCount
}

function assertTableGeometry(table: ProseMirrorNode) {
  const tableMap = TableMap.get(table)

  if (tableMap.problems?.length) {
    throw new RichTextDocumentInvalidError('Table geometry is invalid')
  }
}

function assertTableDocument(document: ProseMirrorNode) {
  let documentTableGridSlotCount = 0

  document.descendants((node) => {
    if (node.type.name !== 'table') {
      return
    }

    documentTableGridSlotCount += getTableGridSlotCount(node)

    if (documentTableGridSlotCount > TABLE_MAX_GRID_SLOTS_PER_DOCUMENT) {
      throw new RichTextDocumentInvalidError('Tables exceed the document-wide grid slot limit')
    }

    assertTableGeometry(node)
    return false
  })
}

function normalizePixelValue(value: string | undefined) {
  return value && pixelValuePattern.test(value) ? value.trim() : undefined
}

function normalizeCellAlignment(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()

  return normalized === 'left' || normalized === 'center' || normalized === 'right'
    ? normalized
    : undefined
}

const normalizeTable: RichTextTagTransform = ({ tagName, attribs }) => {
  const width = normalizePixelValue(getInlineStyleValue(attribs.style, 'width'))
  const minWidth = normalizePixelValue(getInlineStyleValue(attribs.style, 'min-width'))

  return {
    tagName,
    attribs: {
      style: buildRichTextTableStyle(width, minWidth),
    },
  }
}

function normalizeCellAttributes({ tagName, attribs }: Parameters<RichTextTagTransform>[0]) {
  const nextAttributes: Record<string, string> = {}

  for (const attribute of ['colspan', 'rowspan'] as const) {
    const value = attribs[attribute]

    if (value && positiveIntegerPattern.test(value)) {
      nextAttributes[attribute] = value
    }
  }

  if (attribs.colwidth && colwidthPattern.test(attribs.colwidth)) {
    nextAttributes.colwidth = attribs.colwidth
  }

  const textAlign = normalizeCellAlignment(getInlineStyleValue(attribs.style, 'text-align'))

  nextAttributes.style =
    tagName === 'th'
      ? buildRichTextTableHeaderStyle(textAlign)
      : buildRichTextTableCellStyle(textAlign)

  return { tagName, attribs: nextAttributes }
}

const normalizeTableWrapper: RichTextTagTransform = ({ tagName }) => ({
  tagName,
  attribs: {
    class: 'tableWrapper',
    style: richTextTableWrapperStyle,
    tabindex: '0',
    role: 'region',
    'aria-label': '可横向滚动的表格',
  },
})

export const tableHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['div', 'table', 'colgroup', 'col', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: {
    div: ['class', 'style', 'tabindex', 'role', 'aria-label'],
    table: ['style'],
    col: ['style'],
    th: ['colspan', 'rowspan', 'colwidth', 'style'],
    td: ['colspan', 'rowspan', 'colwidth', 'style'],
  },
  allowedStyles: {
    div: {
      'max-width': [/^\s*100%\s*$/],
      'overflow-x': [/^\s*auto\s*$/],
      'overscroll-behavior-x': [/^\s*contain\s*$/],
    },
    table: {
      width: [/^\s*(?:100%|\d+(?:\.\d+)?px)\s*$/],
      'min-width': [pixelValuePattern],
      border: [/^.+$/],
      'border-collapse': [/^\s*collapse\s*$/],
    },
    col: {
      width: [pixelValuePattern],
      'min-width': [pixelValuePattern],
    },
    th: {
      'min-width': [pixelValuePattern],
      border: [/^.+$/],
      padding: [/^\s*0\.5rem 0\.625rem\s*$/],
      'text-align': [/^\s*(?:inherit|left|center|right)\s*$/],
      'vertical-align': [/^\s*top\s*$/],
      'background-color': [/^.+$/],
      'font-weight': [/^\s*600\s*$/],
    },
    td: {
      'min-width': [pixelValuePattern],
      border: [/^.+$/],
      padding: [/^\s*0\.5rem 0\.625rem\s*$/],
      'text-align': [/^\s*(?:inherit|left|center|right)\s*$/],
      'vertical-align': [/^\s*top\s*$/],
    },
  },
  transformTags: {
    div: [normalizeTableWrapper],
    table: [normalizeTable],
    th: [normalizeCellAttributes],
    td: [normalizeCellAttributes],
  },
}

export const tableServerFeature = defineRichTextServerFeature(tableFeature, {
  htmlPolicy: tableHtmlPolicy,
  assertDocument: assertTableDocument,
})
