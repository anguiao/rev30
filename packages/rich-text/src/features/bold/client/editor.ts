import { defineRichTextAction, defineRichTextActionItem } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { boldFeature } from '../core/feature'

export const boldAction = defineRichTextAction(boldFeature, {
  key: boldFeature.key,
  command: ({ chain }) => chain().focus().toggleBold().run(),
  isActive: (editor) => editor.isActive('bold'),
})

export const boldActionItem = defineRichTextActionItem(boldAction, {
  label: '加粗',
  icon: 'i-[lucide--bold]',
})

export const boldEditorFeature = defineRichTextEditorFeature(boldFeature, {})
