import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { strikeFeature } from '../../../src/features/strike/shared'

const editors: Editor[] = []

function createEditor() {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const strikeExtension = strikeFeature.extension()

  const editor = new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(strikeExtension) ? strikeExtension : [strikeExtension]),
    ],
    content: '<p>维护通知</p>',
  })
  editors.push(editor)

  return editor
}

describe('strike feature', () => {
  afterEach(() => {
    document.body.innerHTML = ''

    while (editors.length > 0) {
      editors.pop()?.destroy()
    }
  })

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
