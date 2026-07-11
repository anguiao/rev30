import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { getSchema } from '@tiptap/core'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import { defineRichTextPreset } from '../../../src/core/preset'
import { baseServerFeature, baseHtmlPolicy } from '../../../src/features/base/server'
import { baseFeature } from '../../../src/features/base/shared'
import {
  tableHtmlPolicy,
  tableServerFeature,
  validateRichTextTables,
} from '../../../src/features/table/server'
import { tableFeature } from '../../../src/features/table/shared'
import { deriveRichTextContent } from '../../../src/server/derive'
import { RichTextContentInvalidError } from '../../../src/server/errors'
import { defineRichTextServerPreset } from '../../../src/server/presets/types'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

const schema = getSchema([Document, Paragraph, Text, ...tableServerFeature.extensions!()])

const tableTestPreset = defineRichTextPreset({
  key: 'table-test',
  features: [baseFeature, tableFeature],
})
const tableTestServerPreset = defineRichTextServerPreset(tableTestPreset, [
  baseServerFeature,
  tableServerFeature,
])

function paragraph(text = '') {
  return {
    type: 'paragraph',
    ...(text ? { content: [{ type: 'text', text }] } : {}),
  }
}

function cell(
  options: {
    type?: 'tableCell' | 'tableHeader'
    colspan?: number
    rowspan?: number
    text?: string
  } = {},
) {
  return {
    type: options.type ?? 'tableCell',
    attrs: {
      colspan: options.colspan ?? 1,
      rowspan: options.rowspan ?? 1,
      colwidth: null,
      align: null,
    },
    content: [paragraph(options.text)],
  }
}

function tableDocument(rows: object[][]) {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: rows.map((content) => ({ type: 'tableRow', content })),
      },
    ],
  }
}

function parseDocument(content: object) {
  const document = ProseMirrorNode.fromJSON(schema, content)
  document.check()
  return document
}

describe('table server feature', () => {
  it('uses schema-only extensions in the canonical order', () => {
    expect(tableServerFeature.extensions!().map((extension) => extension.name)).toEqual([
      'table',
      'tableCell',
      'tableHeader',
      'tableRow',
    ])
  })

  it('normalizes cell spans and removes unsupported HTML attributes', () => {
    expect(
      sanitizeRichTextHtml(
        '<table class="grid"><tbody><tr data-row="1"><th colspan="2" rowspan="01" colwidth="120" align="center"><p>标题</p></th></tr><tr><td colspan="999" style="width: 20px"><p>内容</p></td></tr></tbody></table>',
        [baseHtmlPolicy, tableHtmlPolicy],
      ),
    ).toBe(
      '<table><tbody><tr><th colspan="2"><p>标题</p></th></tr><tr><td><p>内容</p></td></tr></tbody></table>',
    )
  })

  it('accepts rectangular tables with row spans and mixed header cells', () => {
    const document = parseDocument(
      tableDocument([
        [
          cell({ type: 'tableHeader', rowspan: 2, text: '标题' }),
          cell({ colspan: 2, text: '内容' }),
        ],
        [cell({ type: 'tableHeader', text: '甲' }), cell({ text: '乙' })],
      ]),
    )

    expect(() => validateRichTextTables(document)).not.toThrow()
  })

  it.each([
    {
      name: 'a non-rectangular layout',
      content: tableDocument([[cell(), cell()], [cell()]]),
    },
    {
      name: 'overlapping row and column spans',
      content: tableDocument([[cell(), cell({ rowspan: 2 })], [cell({ colspan: 2 })]]),
    },
    {
      name: 'a row span outside the table',
      content: tableDocument([[cell({ rowspan: 2 })]]),
    },
    {
      name: 'more than 100 rows',
      content: tableDocument(
        Array.from({ length: 101 }, (_, index) => [cell({ text: String(index) })]),
      ),
    },
  ])('rejects $name', ({ content }) => {
    expect(() => validateRichTextTables(parseDocument(content))).toThrow()
  })

  it('runs structural validation before deriving server output', () => {
    const valid = deriveRichTextContent(
      tableDocument([
        [cell({ type: 'tableHeader', colspan: 2, text: '标题' })],
        [cell({ text: '甲' }), cell({ text: '乙' })],
      ]),
      tableTestServerPreset,
    )

    expect(valid.text).toBe('标题\n甲\t乙')
    expect(valid.html).toBe(
      '<table><tbody><tr><th colspan="2"><p>标题</p></th></tr><tr><td><p>甲</p></td><td><p>乙</p></td></tr></tbody></table>',
    )

    expect(() =>
      deriveRichTextContent(tableDocument([[cell(), cell()], [cell()]]), tableTestServerPreset),
    ).toThrow(RichTextContentInvalidError)
  })
})
