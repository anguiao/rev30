import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { textAlignFeature } from '../../../src/features/text-align/shared'

const editors: Editor[] = []

function createEditor() {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const textAlignExtension = textAlignFeature.extension()

  const editor = new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Heading.configure({ levels: [1, 2, 3] }),
      Text,
      ...(Array.isArray(textAlignExtension) ? textAlignExtension : [textAlignExtension]),
    ],
    content: '<h2>维护通知</h2><p>请留意发布时间</p>',
  })
  editors.push(editor)

  return editor
}

describe('text align feature', () => {
  afterEach(() => {
    document.body.innerHTML = ''

    while (editors.length > 0) {
      editors.pop()?.destroy()
    }
  })

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
})
