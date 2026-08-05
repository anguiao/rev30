import { getSchema } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { listFeature } from '../../../src/features/list/shared'
import { createTestEditor } from '../../helpers/editor'

const extensions = [Document, Paragraph, Text, ...listFeature.sharedExtensions!()]
const schema = getSchema(extensions)

function createEditor(content: string) {
  return createTestEditor({ extensions, content })
}

function orderedList(attrs: Record<string, unknown>) {
  return {
    type: 'doc',
    content: [
      {
        type: 'orderedList',
        attrs,
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '条目' }] }],
          },
        ],
      },
    ],
  }
}

describe('ordered list shared attributes', () => {
  it('canonicalizes valid and invalid external ordered list attributes', () => {
    const editor = createEditor(
      '<ol start="-2" type="invalid" style="list-style-type: upper-alpha"><li><p>条目</p></li></ol><ol start="1.5" type="square"><li><p>默认</p></li></ol>',
    )

    expect(editor.getJSON().content).toMatchObject([
      { attrs: { start: -2, type: null } },
      { attrs: { start: 1, type: null } },
    ])
    expect(() => editor.state.doc.check()).not.toThrow()
  })

  it('keeps Tiptap CSS list-style mappings before normalizing the type', () => {
    const editor = createEditor(
      '<ol style="list-style-type: upper-roman"><li><p>条目</p></li></ol>',
    )

    expect(editor.getJSON().content?.[0]).toMatchObject({ attrs: { start: 1, type: 'I' } })
    expect(() => editor.state.doc.check()).not.toThrow()
  })

  it.each([
    { start: 1.5, type: null },
    { start: Number.MAX_SAFE_INTEGER + 1, type: null },
    { start: 1, type: 'square' },
  ])('rejects invalid JSON attrs: %o', (attrs) => {
    expect(() => schema.nodeFromJSON(orderedList(attrs)).check()).toThrow()
  })
})
