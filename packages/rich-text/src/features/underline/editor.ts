import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { underlineFeature } from './shared'

export const underlineAction = defineRichTextAction(underlineFeature, {
  key: underlineFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().toggleUnderline().run(),
  isActive: (editor) => editor.isActive('underline'),
})

export const underlineActionItem = defineRichTextActionItem(underlineAction, {
  label: '下划线',
  icon: 'i-[lucide--underline]',
})

export const underlineEditorFeature = defineRichTextEditorFeature(underlineFeature, {})
