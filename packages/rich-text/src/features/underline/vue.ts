import { defineRichTextCommand } from '../../vue/toolbar'
import { underlineFeature } from './shared'

export const underlineCommand = defineRichTextCommand({
  key: underlineFeature.key,
  label: '下划线',
  icon: 'i-[lucide--underline]',
  run: (editor) => editor.chain().focus().toggleUnderline().run(),
  isActive: (editor) => editor.isActive('underline'),
})
