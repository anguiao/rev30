import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { strikeFeature } from './shared'

export const strikeAction = defineRichTextAction(strikeFeature, {
  key: strikeFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().toggleStrike().run(),
  isActive: (editor) => editor.isActive('strike'),
})

export const strikeActionItem = defineRichTextActionItem(strikeAction, {
  label: '删除线',
  icon: 'i-[lucide--strikethrough]',
})

export const strikeEditorFeature = defineRichTextEditorFeature(strikeFeature, {})
