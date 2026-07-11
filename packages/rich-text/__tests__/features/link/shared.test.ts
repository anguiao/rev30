import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Fragment, Slice } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'
import { linkFeature } from '../../../src/features/link/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...linkFeature.documentExtensions!()],
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

  it.each(['ftp://example.com', '//example.com', 'example.com:8080/docs'])(
    'does not link unsupported URL pasted over selected text: %s',
    (url) => {
      const editor = createEditor()
      selectEditorText(editor)

      expect(pasteTextOverSelection(editor, url)).not.toBe(true)
      expect(JSON.stringify(editor.getJSON())).not.toContain('"link"')
    },
  )

  it.each(['/docs', './docs', '../docs', '#details', '?page=1', 'example.com:8080/docs'])(
    'rejects unsupported href values: %s',
    (href) => {
      const editor = createEditor()
      selectEditorText(editor)

      expect(editor.commands.setLink({ href })).toBe(false)
      expect(JSON.stringify(editor.getJSON())).not.toContain('"link"')
    },
  )

  it('rejects unsafe href values during document validation', () => {
    const editor = createEditor()
    const link = editor.schema.mark('link', { href: 'javascript:alert(1)' })
    const text = editor.schema.text('维护通知', [link])
    const paragraph = editor.schema.node('paragraph', null, text)
    const document = editor.schema.node('doc', null, paragraph)

    expect(() => document.check()).toThrow('Invalid link href')
  })

  it('does not persist presentation attributes on link marks', () => {
    const editor = createEditor()
    const document = editor.schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://example.com',
                    target: '_self',
                    rel: 'author',
                    class: 'custom-link',
                    title: 'Example',
                  },
                },
              ],
              text: '维护通知',
            },
          ],
        },
      ],
    })

    expect(document.toJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(document.toJSON())).not.toContain('custom-link')
    expect(JSON.stringify(document.toJSON())).not.toContain('author')
  })
})
