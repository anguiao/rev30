import { defineRichTextAction, defineRichTextActionItem } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { strikeFeature } from '../core/feature'

export const strikeAction = defineRichTextAction(strikeFeature, {
  key: strikeFeature.key,
  command: ({ chain }) => chain().focus().toggleStrike().run(),
  isActive: (editor) => editor.isActive('strike'),
})

export const strikeActionItem = defineRichTextActionItem(strikeAction, {
  label: '删除线',
  icon: 'i-[lucide--strikethrough]',
})

export const strikeEditorFeature = defineRichTextEditorFeature(strikeFeature, {})
