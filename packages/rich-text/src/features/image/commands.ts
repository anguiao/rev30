import type { Editor } from '@tiptap/core'
import type { RichTextImageAttrs } from './shared'

export function insertRichTextImage(editor: Editor, attrs: RichTextImageAttrs) {
  return editor.chain().focus().insertContent({ type: 'image', attrs }).run()
}

export function updateRichTextImage(editor: Editor, attrs: RichTextImageAttrs) {
  return editor.chain().focus().updateAttributes('image', attrs).run()
}
