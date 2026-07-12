import { getSchema } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { textAlignFeature } from '../../../src/features/text-align/shared'
import { createTestEditor } from '../../helpers/editor'

const extensions = [
  Document,
  Paragraph,
  Heading.configure({ levels: [1, 2, 3] }),
  Text,
  ...textAlignFeature.documentExtensions!(),
]
const schema = getSchema(extensions)

function createEditor() {
  return createTestEditor({
    extensions,
    content: '<h2>维护通知</h2><p>请留意发布时间</p>',
  })
}

describe('text align feature', () => {
  it('aligns heading and paragraph nodes', () => {
    const editor = createEditor()

    editor.commands.selectAll()
    expect(editor.commands.setTextAlign('center')).toBe(true)

    expect(editor.getJSON()).toMatchObject({
      content: [
        { type: 'heading', attrs: { level: 2, textAlign: 'center' } },
        { type: 'paragraph', attrs: { textAlign: 'center' } },
      ],
    })
  })

  it.each(['left', 'center', 'right', 'justify', null])(
    'accepts the supported alignment: %s',
    (textAlign) => {
      expect(() =>
        schema.nodeFromJSON({
          type: 'paragraph',
          attrs: { textAlign },
        }),
      ).not.toThrow()
    },
  )

  it.each(['start', 'left; position: fixed', 1, {}])(
    'rejects an unsupported alignment: %s',
    (textAlign) => {
      expect(() =>
        schema.nodeFromJSON({
          type: 'paragraph',
          attrs: { textAlign },
        }),
      ).toThrow()
    },
  )
})
