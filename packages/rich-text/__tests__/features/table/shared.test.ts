import { getSchema } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { tableEditorFeature } from '../../../src/features/table/editor'
import { tableFeature } from '../../../src/features/table/shared'
import { createTestEditor } from '../../helpers/editor'

const schema = getSchema([Document, Paragraph, Text, ...tableEditorFeature.extensions!()])

function createEditor(content: string | object = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...tableEditorFeature.extensions!()],
    content,
  })
}

describe('table feature', () => {
  it('declares the canonical feature contract without shared document extensions', () => {
    expect(tableFeature).toMatchObject({
      key: 'table',
      editorImplementation: true,
      serverImplementation: true,
    })
    expect(tableFeature.documentExtensions).toBeUndefined()
    expect(tableEditorFeature.extensions!().map((extension) => extension.name)).toEqual([
      'table',
      'tableCell',
      'tableHeader',
      'tableRow',
    ])
  })

  it('accepts canonical cell attributes from JSON', () => {
    expect(() =>
      schema.nodeFromJSON({
        type: 'tableCell',
        attrs: { colspan: 2, rowspan: 3, colwidth: null, align: null },
        content: [{ type: 'paragraph' }],
      }),
    ).not.toThrow()
  })

  it.each([
    ['colspan', 0],
    ['colspan', 101],
    ['colspan', 1.5],
    ['colspan', '2'],
    ['rowspan', 0],
    ['rowspan', 101],
    ['rowspan', 1.5],
    ['rowspan', '2'],
    ['colwidth', [120]],
    ['align', 'center'],
  ] as const)('rejects an invalid %s attribute: %s', (attribute, value) => {
    expect(() =>
      schema.nodeFromJSON({
        type: 'tableCell',
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: null,
          align: null,
          [attribute]: value,
        },
        content: [{ type: 'paragraph' }],
      }),
    ).toThrow()
  })

  it('strictly normalizes table attributes imported from HTML', () => {
    const editor = createEditor(
      '<table><tbody><tr><td colspan="02" rowspan="101" colwidth="120" align="center"><p>维护通知</p></td></tr></tbody></table>',
    )

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
                },
              ],
            },
          ],
        },
      ],
    })
    expect(editor.getHTML()).toBe('<table><tbody><tr><td><p>维护通知</p></td></tr></tbody></table>')
  })
})
