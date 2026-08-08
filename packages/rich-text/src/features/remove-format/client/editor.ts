import { defineRichTextAction, defineRichTextActionItem } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { removeFormatFeature } from '../core/feature'

export const removeFormatAction = defineRichTextAction(removeFormatFeature, {
  key: removeFormatFeature.key,
  command: ({ chain }) => chain().focus().unsetAllMarks().run(),
})

export const removeFormatActionItem = defineRichTextActionItem(removeFormatAction, {
  label: '清除格式',
  icon: 'i-[lucide--eraser]',
})

export const removeFormatEditorFeature = defineRichTextEditorFeature(removeFormatFeature, {})
