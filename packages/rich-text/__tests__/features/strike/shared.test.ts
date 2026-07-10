import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { strikeFeature } from '../../../src/features/strike/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor() {
  const strikeExtension = strikeFeature.extension()

  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(strikeExtension) ? strikeExtension : [strikeExtension]),
    ],
    content: '<p>维护通知</p>',
  })
}

describe('strike feature', () => {
  it('toggles strike marks', () => {
    const editor = createEditor()

    editor.commands.setTextSelection({
      from: 1,
      to: editor.state.doc.nodeSize - 3,
    })
    editor.commands.toggleStrike()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: 'strike' }],
              text: '维护通知',
            },
          ],
        },
      ],
    })
  })
})
