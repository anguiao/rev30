import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TableMap } from '@tiptap/pm/tables'
import { RichTextDocumentInvalidError } from '../../server/errors'
import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/sanitize'
import { tableFeature } from './shared'

const TABLE_MAX_LOGICAL_POSITIONS_PER_TABLE = 10_000
const TABLE_MAX_LOGICAL_POSITIONS_PER_DOCUMENT = 100_000
const pixelValuePattern = /^\s*\d+(?:\.\d+)?px\s*$/
const positiveIntegerPattern = /^[1-9]\d*$/
const colwidthPattern = /^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?)*$/

function getTableWidth(table: ProseMirrorNode) {
  let width = 0
  const activeRowspans: Array<{ endRow: number; colspan: number }> = []

  for (let row = 0; row < table.childCount; row += 1) {
    let rowWidth = 0

    for (const span of activeRowspans) {
      if (span.endRow > row) {
        rowWidth += span.colspan
      }
    }

    const rowNode = table.child(row)

    for (let index = 0; index < rowNode.childCount; index += 1) {
      const cell = rowNode.child(index)
      const { colspan, rowspan } = cell.attrs as { colspan: number; rowspan: number }

      rowWidth += colspan

      if (rowspan > 1) {
        activeRowspans.push({ endRow: row + rowspan, colspan })
      }
    }

    width = Math.max(width, rowWidth)
  }

  return width
}

function getTableLogicalPositions(table: ProseMirrorNode) {
  const width = getTableWidth(table)
  const logicalPositions = width * table.childCount

  if (
    !Number.isSafeInteger(logicalPositions) ||
    logicalPositions > TABLE_MAX_LOGICAL_POSITIONS_PER_TABLE
  ) {
    throw new RichTextDocumentInvalidError('Table exceeds the logical grid resource limit')
  }

  return logicalPositions
}

function assertTableGeometry(table: ProseMirrorNode) {
  const tableMap = TableMap.get(table)

  if (tableMap.problems?.length) {
    throw new RichTextDocumentInvalidError('Table geometry is invalid')
  }
}

export function assertTableDocument(document: ProseMirrorNode) {
  let documentLogicalPositions = 0

  document.descendants((node) => {
    if (node.type.name === 'table') {
      const tableLogicalPositions = getTableLogicalPositions(node)

      if (
        tableLogicalPositions >
        TABLE_MAX_LOGICAL_POSITIONS_PER_DOCUMENT - documentLogicalPositions
      ) {
        throw new RichTextDocumentInvalidError(
          'Tables exceed the document-wide logical grid resource limit',
        )
      }

      documentLogicalPositions += tableLogicalPositions
      assertTableGeometry(node)
    }

    return true
  })
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

  if (attribs.style) {
    nextAttributes.style = attribs.style
  }

  return { tagName, attribs: nextAttributes }
}

const normalizeTableWrapper: RichTextTagTransform = ({ tagName }) => ({
  tagName,
  attribs: {
    class: 'tableWrapper',
    style: 'overflow-x: auto',
    tabindex: '0',
    role: 'region',
    'aria-label': '可横向滚动的表格',
  },
})

export function createTableHtmlPolicy(): RichTextHtmlPolicy {
  return {
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
        'overflow-x': [/^\s*auto\s*$/],
      },
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
      th: [normalizeCellAttributes],
      td: [normalizeCellAttributes],
    },
  }
}

export const tableServerFeature = defineRichTextServerFeature(tableFeature, {
  htmlPolicy: createTableHtmlPolicy(),
  assertDocument: assertTableDocument,
})
