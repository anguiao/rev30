import { getSchema } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { baseFeature } from '../../../src/features/base/shared'
import { headingFeature } from '../../../src/features/heading/shared'
import { tableFeature } from '../../../src/features/table/shared'
import { allRichTextPreset } from '../../../src/presets/all'
import { createTestEditor } from '../../helpers/editor'

function createExtensions() {
  return [
    ...baseFeature.sharedExtensions!(),
    ...headingFeature.sharedExtensions!(),
    ...tableFeature.sharedExtensions!(),
  ]
}

const schema = getSchema(createExtensions())

function createEditor(content: string) {
  return createTestEditor({
    extensions: createExtensions(),
    content,
  })
}

function tableDocument(attrs: Record<string, unknown>) {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs,
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '内容' }] }],
              },
            ],
          },
        ],
      },
    ],
  }
}

function getFirstTableCell(editor: ReturnType<typeof createEditor>) {
  const table = editor.state.doc.firstChild
  const row = table?.firstChild
  const cell = row?.firstChild

  if (!table || table.type.name !== 'table' || !cell) {
    throw new Error('Expected a table cell')
  }

  return cell
}

describe('table shared feature', () => {
  it('declares editor and server implementations and creates a complete extension set', () => {
    expect(tableFeature).toMatchObject({
      key: 'table',
      editorImplementation: true,
      serverImplementation: true,
    })

    const extensions = tableFeature.sharedExtensions!()

    expect(extensions.map((extension) => extension.name)).toEqual([
      'table',
      'tableRow',
      'tableCell',
      'tableHeader',
    ])
    expect(tableFeature.sharedExtensions!()).not.toBe(extensions)
    expect(tableFeature.sharedExtensions!()[0]).not.toBe(extensions[0])
  })

  it('uses paragraph-only cells, a wrapped non-resizable table, and strict cell attributes', () => {
    expect(schema.nodes.table!.spec.content).toBe('tableRow+')
    expect(schema.nodes.tableCell!.spec.content).toBe('paragraph+')
    expect(schema.nodes.tableHeader!.spec.content).toBe('paragraph+')
    expect(schema.nodes.table!.spec.toDOM).toBeDefined()

    const valid = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 1, rowspan: 1, colwidth: [20], align: 'center' },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '标题' }] }],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(valid.firstChild?.firstChild?.firstChild?.type.name).toBe('tableHeader')
    expect(() =>
      schema
        .nodeFromJSON({
          type: 'doc',
          content: [
            {
              type: 'table',
              content: [
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableCell',
                      content: [{ type: 'heading', attrs: { level: 1 } }],
                    },
                  ],
                },
              ],
            },
          ],
        })
        .check(),
    ).toThrow()
  })

  it('canonicalizes external table cell attributes before the document is checked', () => {
    const editor = createEditor(
      '<table><tbody><tr><td colspan="10001" rowspan="0" colwidth="20,invalid" style="text-align: center"><p>内容</p></td></tr></tbody></table>',
    )

    expect(getFirstTableCell(editor)).toMatchObject({
      attrs: { colspan: 1, rowspan: 1, colwidth: null, align: 'center' },
    })
    expect(() => editor.state.doc.check()).not.toThrow()
  })

  it('keeps valid external table cell attributes in canonical form', () => {
    const editor = createEditor(
      '<table><tbody><tr><th colspan="2" rowspan="3" colwidth="20, 30" style="text-align: right"><p>标题</p></th></tr></tbody></table>',
    )

    expect(getFirstTableCell(editor)).toMatchObject({
      attrs: { colspan: 2, rowspan: 3, colwidth: [20, 30], align: 'right' },
    })
    expect(() => editor.state.doc.check()).not.toThrow()
  })

  it('keeps the Tiptap colgroup width fallback when cells omit colwidth', () => {
    const editor = createEditor(
      '<table><colgroup><col width="42"></colgroup><tbody><tr><td><p>内容</p></td></tr></tbody></table>',
    )

    expect(getFirstTableCell(editor)).toMatchObject({ attrs: { colwidth: [42] } })
    expect(() => editor.state.doc.check()).not.toThrow()
  })

  it.each([
    { colspan: 0, rowspan: 1, colwidth: null, align: null },
    { colspan: 10_001, rowspan: 1, colwidth: null, align: null },
    { colspan: 1, rowspan: 1, colwidth: [20, Number.NaN], align: null },
    { colspan: 1, rowspan: 1, colwidth: null, align: 'justify' },
  ])('rejects invalid table JSON attrs: %o', (attrs) => {
    expect(() => schema.nodeFromJSON(tableDocument(attrs)).check()).toThrow()
  })

  it('belongs to all preset only', () => {
    expect(allRichTextPreset.features).toContain(tableFeature)
  })
})
