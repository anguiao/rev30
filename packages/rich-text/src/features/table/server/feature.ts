import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TableMap } from '@tiptap/pm/tables'
import { RichTextDocumentInvalidError } from '../../../server/errors'
import { defineRichTextServerFeature } from '../../../server/feature'
import {
  getInlineStyleValue,
  type RichTextHtmlPolicy,
  type RichTextTagTransform,
} from '../../../server/sanitize'
import {
  normalizeTableCellAlign,
  normalizeTableCellSpan,
  normalizeTableColwidth,
  MAX_GRID_SLOTS_PER_TABLE,
} from '../core/attrs'
import { tableFeature } from '../core/feature'

const TABLE_MAX_GRID_SLOTS_PER_DOCUMENT = 100_000

const pixelValuePattern = /^\s*\d+(?:\.\d+)?px\s*$/

function getTableGridSlotCount(table: ProseMirrorNode) {
  const rowCount = table.childCount
  const maximumAllowedColumnCount = Math.floor(MAX_GRID_SLOTS_PER_TABLE / rowCount)
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

const normalizeTable: RichTextTagTransform = ({ tagName, attribs }) => {
  const width = normalizePixelValue(getInlineStyleValue(attribs.style, 'width'))
  const minWidth = normalizePixelValue(getInlineStyleValue(attribs.style, 'min-width'))
  const style = [
    ...(width ? [`width: ${width}`] : []),
    ...(minWidth ? [`min-width: ${minWidth}`] : []),
  ].join('; ')

  return {
    tagName,
    attribs: {
      ...(style ? { style } : {}),
    },
  }
}

function normalizeCellAttributes({ tagName, attribs }: Parameters<RichTextTagTransform>[0]) {
  const nextAttributes: Record<string, string> = {}

  for (const attribute of ['colspan', 'rowspan'] as const) {
    const value = normalizeTableCellSpan(attribs[attribute])

    if (value !== 1) {
      nextAttributes[attribute] = String(value)
    }
  }

  const colwidth = normalizeTableColwidth(attribs.colwidth)

  if (colwidth) {
    nextAttributes.colwidth = colwidth.join(',')
  }

  const textAlign = normalizeTableCellAlign(getInlineStyleValue(attribs.style, 'text-align'))

  if (textAlign) {
    nextAttributes.style = `text-align: ${textAlign}`
  }

  return { tagName, attribs: nextAttributes }
}

const normalizeTableWrapper: RichTextTagTransform = ({ tagName }) => ({
  tagName,
  attribs: {
    class: 'tableWrapper',
    tabindex: '0',
    role: 'region',
    'aria-label': '可横向滚动的表格',
  },
})

export const tableHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['div', 'table', 'colgroup', 'col', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: {
    div: ['class', 'tabindex', 'role', 'aria-label'],
    table: ['style'],
    col: ['style'],
    th: ['colspan', 'rowspan', 'colwidth', 'style'],
    td: ['colspan', 'rowspan', 'colwidth', 'style'],
  },
  allowedStyles: {
    table: {
      width: [pixelValuePattern],
      'min-width': [pixelValuePattern],
    },
    col: {
      width: [pixelValuePattern],
      'min-width': [pixelValuePattern],
    },
    th: {
      'text-align': [/^\s*(?:left|center|right)\s*$/],
    },
    td: {
      'text-align': [/^\s*(?:left|center|right)\s*$/],
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
