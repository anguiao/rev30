import { defineRichTextCommand } from '../../vue/toolbar'
import { strikeFeature } from './shared'

export const strikeCommand = defineRichTextCommand({
  key: strikeFeature.key,
  label: '删除线',
  icon: 'i-[lucide--strikethrough]',
  run: (editor) => editor.chain().focus().toggleStrike().run(),
  isActive: (editor) => editor.isActive('strike'),
})
