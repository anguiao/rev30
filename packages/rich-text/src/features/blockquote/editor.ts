import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { blockquoteFeature } from './shared'

export const blockquoteAction = defineRichTextAction(blockquoteFeature, {
  key: blockquoteFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().toggleBlockquote().run(),
  isActive: (editor) => editor.isActive('blockquote'),
})

export const blockquoteActionItem = defineRichTextActionItem(blockquoteAction, {
  label: '引用',
  icon: 'i-[lucide--quote]',
})

export const blockquoteEditorFeature = defineRichTextEditorFeature(blockquoteFeature, {})
