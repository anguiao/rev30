import { defineRichTextAction, defineRichTextActionItem } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { italicFeature } from '../core/feature'

export const italicAction = defineRichTextAction(italicFeature, {
  key: italicFeature.key,
  command: ({ chain }) => chain().focus().toggleItalic().run(),
  isActive: (editor) => editor.isActive('italic'),
})

export const italicActionItem = defineRichTextActionItem(italicAction, {
  label: '斜体',
  icon: 'i-[lucide--italic]',
})

export const italicEditorFeature = defineRichTextEditorFeature(italicFeature, {})
