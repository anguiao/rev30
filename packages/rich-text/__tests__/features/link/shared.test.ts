import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Fragment, Slice } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'
import { linkFeature } from '../../../src/features/link/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor() {
  const linkExtension = linkFeature.extension()

  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(linkExtension) ? linkExtension : [linkExtension]),
    ],
    content: '<p>维护通知</p>',
  })
}

function selectEditorText(editor: Editor) {
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.nodeSize - 3,
  })
}

function pasteTextOverSelection(editor: Editor, text: string) {
  const slice = new Slice(Fragment.from(editor.schema.text(text)), 0, 0)

  return editor.view.someProp('handlePaste', (handler) => {
    return handler(editor.view, new Event('paste') as ClipboardEvent, slice)
  })
}

describe('link feature', () => {
  it('links allowed URLs pasted over selected text', () => {
    const editor = createEditor()
    selectEditorText(editor)

    expect(pasteTextOverSelection(editor, 'https://example.com')).toBe(true)

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
              text: '维护通知',
            },
          ],
        },
      ],
    })
  })

  it.each(['ftp://example.com', '//example.com'])(
    'does not link unsupported URL pasted over selected text: %s',
    (url) => {
      const editor = createEditor()
      selectEditorText(editor)

      expect(pasteTextOverSelection(editor, url)).not.toBe(true)
      expect(JSON.stringify(editor.getJSON())).not.toContain('"link"')
    },
  )
})
