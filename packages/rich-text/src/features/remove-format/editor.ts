import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { removeFormatFeature } from './shared'

export const removeFormatAction = defineRichTextAction(removeFormatFeature, {
  key: removeFormatFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().unsetAllMarks().run(),
})

export const removeFormatActionItem = defineRichTextActionItem(removeFormatAction, {
  label: '清除格式',
  icon: 'i-[lucide--eraser]',
})

export const removeFormatEditorFeature = defineRichTextEditorFeature(removeFormatFeature, {})
