import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { italicFeature } from './shared'

export const italicAction = defineRichTextAction(italicFeature, {
  key: italicFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().toggleItalic().run(),
  isActive: (editor) => editor.isActive('italic'),
})

export const italicEditorFeature = defineRichTextEditorFeature(italicFeature, {})
