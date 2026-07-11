import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { textAlignFeature } from '../../../src/features/text-align/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Heading.configure({ levels: [1, 2, 3] }),
      Text,
      ...textAlignFeature.documentExtensions!(),
    ],
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

  it.each(['left', 'center', 'right', null])('accepts the supported alignment: %s', (textAlign) => {
    const editor = createEditor()

    expect(() =>
      editor.schema.nodeFromJSON({
        type: 'paragraph',
        attrs: { textAlign },
      }),
    ).not.toThrow()
  })

  it.each(['justify', 'left; position: fixed', 1, {}])(
    'rejects an unsupported alignment: %s',
    (textAlign) => {
      const editor = createEditor()

      expect(() =>
        editor.schema.nodeFromJSON({
          type: 'paragraph',
          attrs: { textAlign },
        }),
      ).toThrow()
    },
  )
})
