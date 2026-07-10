import { defineRichTextCommand } from '../../vue/toolbar'
import { removeFormatFeature } from './shared'

export const removeFormatCommand = defineRichTextCommand({
  key: removeFormatFeature.key,
  label: '清除格式',
  icon: 'i-[lucide--eraser]',
  run: (editor) => editor.chain().focus().unsetAllMarks().run(),
})
