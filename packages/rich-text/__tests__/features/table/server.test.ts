import { TableMap } from '@tiptap/pm/tables'
import { describe, expect, it, vi } from 'vitest'
import { createTableHtmlPolicy } from '../../../src/features/table/server'
import { RichTextContentInvalidError, deriveRichTextContent } from '../../../src/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'
import { createAllRichTextServerPreset } from '../../../src/server/presets/all'

const preset = createAllRichTextServerPreset({
  image: {
    isAllowedSrc: () => true,
  },
})

function cell(type: 'tableCell' | 'tableHeader' = 'tableCell', text = '') {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: null },
        content: text ? [{ type: 'text', text }] : undefined,
      },
    ],
  }
}

function table(rows: unknown[][]) {
  return { type: 'table', content: rows.map((content) => ({ type: 'tableRow', content })) }
}

describe('table server feature', () => {
  it('derives canonical json, default text, and semantic wrapped html', () => {
    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          table([
            [cell('tableHeader', '姓名'), cell('tableHeader', '状态')],
            [cell('tableCell', '张三'), cell('tableCell', '正常')],
          ]),
        ],
      },
      preset,
    )

    expect(content.json).toMatchObject({
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader' }, { type: 'tableHeader' }] },
            { type: 'tableRow', content: [{ type: 'tableCell' }, { type: 'tableCell' }] },
          ],
        },
      ],
    })
    expect(content.text).toBe('姓名\n\n\n\n状态\n\n\n\n\n\n张三\n\n\n\n正常')
    expect(content.html).toContain('<div class="tableWrapper"')
    expect(content.html).toContain('overflow-x:auto')
    expect(content.html).toContain('role="region"')
    expect(content.html).toContain('<table')
    expect(content.html).toContain('<colgroup>')
    expect(content.html).toContain('<th')
    expect(content.html).toContain('<td')
  })

  it('accepts inline marks, hard breaks, paragraph attributes, and legal cell attributes', () => {
    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          table([
            [
              {
                ...cell('tableCell', 'x'),
                attrs: { colspan: 2, rowspan: 1, colwidth: [20, 30], align: 'right' },
                content: [
                  {
                    type: 'paragraph',
                    attrs: { textAlign: 'center' },
                    content: [
                      { type: 'text', text: '粗体', marks: [{ type: 'bold' }] },
                      { type: 'hardBreak' },
                      { type: 'text', text: '文字' },
                    ],
                  },
                ],
              },
            ],
            [
              {
                ...cell('tableHeader', 'h'),
                attrs: { colspan: 2, rowspan: 1, colwidth: [20, 30], align: 'left' },
              },
            ],
          ]),
        ],
      },
      preset,
    )

    const tableContent = content.json as unknown as {
      content: Array<{
        content: Array<{ content: Array<{ attrs: Record<string, unknown> }> }>
      }>
    }

    expect(tableContent.content[0]?.content[0]?.content[0]).toMatchObject({
      attrs: { colspan: 2, colwidth: [20, 30], align: 'right' },
    })
    expect(content.html).toContain('text-align:center')
    expect(content.html).toContain('width:96px')
  })

  it.each([
    ['heading', [{ type: 'heading', attrs: { level: 1 } }]],
    ['list', [{ type: 'bulletList', content: [] }]],
    ['code block', [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }]],
    ['image', [{ type: 'image', attrs: { src: 'https://example.com/x' } }]],
    ['horizontal rule', [{ type: 'horizontalRule' }]],
    ['nested table', [table([[cell()]])]],
  ])('rejects %s in a cell', (_name, content) => {
    expect(() =>
      deriveRichTextContent(
        {
          type: 'doc',
          content: [table([[{ ...cell(), content }]])],
        },
        preset,
      ),
    ).toThrow(RichTextContentInvalidError)
  })

  it.each([
    ['invalid align', { colspan: 1, rowspan: 1, colwidth: null, align: 'justify' }],
    ['invalid colspan', { colspan: 0, rowspan: 1, colwidth: null, align: null }],
    ['invalid rowspan', { colspan: 1, rowspan: -1, colwidth: null, align: null }],
    ['invalid colwidth', { colspan: 1, rowspan: 1, colwidth: ['96'], align: null }],
  ])('rejects %s', (_name, attrs) => {
    expect(() =>
      deriveRichTextContent({ type: 'doc', content: [table([[{ ...cell(), attrs }]])] }, preset),
    ).toThrow(RichTextContentInvalidError)
  })

  it.each([
    ['missing cells', table([[cell()], []])],
    [
      'colliding cells',
      table([
        [{ ...cell(), attrs: { colspan: 1, rowspan: 2, colwidth: null, align: null } }],
        [cell()],
      ]),
    ],
    [
      'overlong rowspan',
      table([
        [{ ...cell(), attrs: { colspan: 1, rowspan: 3, colwidth: null, align: null } }],
        [cell()],
      ]),
    ],
    [
      'inconsistent colwidth mapping',
      table([
        [{ ...cell(), attrs: { colspan: 1, rowspan: 1, colwidth: [20], align: null } }],
        [{ ...cell(), attrs: { colspan: 1, rowspan: 1, colwidth: [30], align: null } }],
      ]),
    ],
    ['zero-width row', table([[]])],
  ])('rejects geometrically invalid tables: %s', (_name, content) => {
    expect(() => deriveRichTextContent({ type: 'doc', content: [content] }, preset)).toThrow(
      RichTextContentInvalidError,
    )
  })

  it('rejects a table that exceeds the logical grid resource limit before mapping', () => {
    const rows = Array.from({ length: 101 }, () => Array.from({ length: 100 }, () => cell()))

    expect(() => deriveRichTextContent({ type: 'doc', content: [table(rows)] }, preset)).toThrow(
      RichTextContentInvalidError,
    )
  })

  it('counts active rowspans before constructing a TableMap', () => {
    const tableMapGet = vi.spyOn(TableMap, 'get')
    const oversizedTable = table([
      [
        {
          ...cell(),
          attrs: { colspan: 4000, rowspan: 2, colwidth: null, align: null },
        },
        {
          ...cell(),
          attrs: { colspan: 1000, rowspan: 1, colwidth: null, align: null },
        },
      ],
      [
        {
          ...cell(),
          attrs: { colspan: 5000, rowspan: 1, colwidth: null, align: null },
        },
      ],
    ])

    expect(() => deriveRichTextContent({ type: 'doc', content: [oversizedTable] }, preset)).toThrow(
      RichTextContentInvalidError,
    )
    expect(tableMapGet).not.toHaveBeenCalled()

    tableMapGet.mockRestore()
  })

  it('normalizes the table wrapper and keeps only renderer table attributes', () => {
    const html = sanitizeRichTextHtml(
      '<div class="evil" style="overflow-x: scroll; color: red" tabindex="9" role="button" onclick="alert(1)"><table style="width: 120px; color: red" data-table="evil"><tbody><tr><td colspan="0" rowspan="2" colwidth="20,30" style="text-align: justify; color: red">内容</td></tr></tbody></table></div>',
      [createTableHtmlPolicy()],
    )

    expect(html).toContain(
      '<div class="tableWrapper" style="overflow-x:auto" tabindex="0" role="region" aria-label="可横向滚动的表格">',
    )
    expect(html).toContain('<table style="width:120px">')
    expect(html).toContain('<td rowspan="2" colwidth="20,30">内容</td>')
    expect(html).not.toContain('evil')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('colspan="0"')
    expect(html).not.toContain('overflow-x:scroll')
    expect(html).not.toContain('color:red')
  })
})
