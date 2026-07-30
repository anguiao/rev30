import { TableMap } from '@tiptap/pm/tables'
import { describe, expect, it, vi } from 'vitest'
import { tableHtmlPolicy } from '../../../src/features/table/server'
import { RichTextContentInvalidError, deriveRichTextContent } from '../../../src/server'
import { RichTextDocumentInvalidError } from '../../../src/server/errors'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'
import { createAllRichTextServerPreset } from '../../../src/server/presets/all'

const preset = createAllRichTextServerPreset({
  image: {
    isAllowedSrc: () => true,
  },
})
const tableGridSlotLimit = 10_000
const maximumTableCountAtGridSlotLimit = 10

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

function expectDocumentInvalidError(run: () => void, message: string) {
  let thrown: unknown

  try {
    run()
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(RichTextContentInvalidError)

  const cause = (thrown as RichTextContentInvalidError).cause

  expect(cause).toBeInstanceOf(RichTextDocumentInvalidError)
  expect(cause).toMatchObject({ message })
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
    expect(content.html).toContain(
      '<div class="tableWrapper" style="max-width:100%;overflow-x:auto;overscroll-behavior-x:contain"',
    )
    expect(content.html).toContain('role="region"')
    expect(content.html).toContain(
      '<table style="width:100%;min-width:192px;border:1px solid var(--rich-text-theme-table-border-color, var(--rich-text-table-border-color, light-dark(#e7e5e4, #3f3f46)));border-collapse:collapse">',
    )
    expect(content.html).toContain('<colgroup>')
    expect(content.html).toContain(
      'padding:0.5rem 0.625rem;text-align:inherit;vertical-align:top;background-color:var(--rich-text-theme-table-header-color, var(--rich-text-table-header-color, light-dark(#f5f5f4, #18181b)));font-weight:600',
    )
    expect(content.html).toContain(
      'padding:0.5rem 0.625rem;text-align:inherit;vertical-align:top"><p>张三</p>',
    )
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
    expect(content.html).toContain('text-align:right')
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
    expectDocumentInvalidError(
      () => deriveRichTextContent({ type: 'doc', content: [content] }, preset),
      'Table geometry is invalid',
    )
  })

  it('rejects a table that exceeds the grid slot limit before mapping', () => {
    const rows = Array.from({ length: 101 }, () => Array.from({ length: 100 }, () => cell()))

    expectDocumentInvalidError(
      () => deriveRichTextContent({ type: 'doc', content: [table(rows)] }, preset),
      'Table exceeds the grid slot limit',
    )
  })

  it('rejects tables that collectively exceed the document resource limit before mapping', () => {
    const tableMapGet = vi.spyOn(TableMap, 'get')
    const maximumTable = table([
      [
        {
          ...cell(),
          attrs: {
            colspan: tableGridSlotLimit,
            rowspan: 1,
            colwidth: null,
            align: null,
          },
        },
      ],
    ])
    const tables = Array.from({ length: maximumTableCountAtGridSlotLimit + 1 }, () => maximumTable)

    expectDocumentInvalidError(
      () => deriveRichTextContent({ type: 'doc', content: tables }, preset),
      'Tables exceed the document-wide grid slot limit',
    )
    expect(tableMapGet).toHaveBeenCalledTimes(maximumTableCountAtGridSlotLimit)

    tableMapGet.mockRestore()
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
      '<div class="evil" style="overflow-x: scroll; color: red" tabindex="9" role="button" onclick="alert(1)"><table style="width: 120px; border: 99px solid red; border-collapse: separate; color: red" data-table="evil"><tbody><tr><td colspan="0" rowspan="2" colwidth="20,30" style="min-width: 1px; border: 99px solid red; padding: 9rem; text-align: justify; vertical-align: bottom; color: red">内容</td></tr></tbody></table></div>',
      [tableHtmlPolicy],
    )

    expect(html).toContain(
      '<div class="tableWrapper" style="max-width:100%;overflow-x:auto;overscroll-behavior-x:contain" tabindex="0" role="region" aria-label="可横向滚动的表格">',
    )
    expect(html).toContain(
      '<table style="width:120px;border:1px solid var(--rich-text-theme-table-border-color, var(--rich-text-table-border-color, light-dark(#e7e5e4, #3f3f46)));border-collapse:collapse">',
    )
    expect(html).toContain(
      '<td rowspan="2" colwidth="20,30" style="min-width:96px;border:1px solid var(--rich-text-theme-table-border-color, var(--rich-text-table-border-color, light-dark(#e7e5e4, #3f3f46)));padding:0.5rem 0.625rem;text-align:inherit;vertical-align:top">内容</td>',
    )
    expect(html).not.toContain('evil')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('colspan="0"')
    expect(html).not.toContain('overflow-x:scroll')
    expect(html).not.toContain('99px')
    expect(html).not.toContain('9rem')
    expect(html).not.toContain('vertical-align:bottom')
    expect(html).not.toContain('color:red')
  })
})
