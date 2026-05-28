import { defineRichTextCommand } from '../../vue/toolbar/types'
import { boldFeature } from './shared'

export const boldCommand = defineRichTextCommand({
  key: boldFeature.key,
  label: '加粗',
  icon: 'i-[lucide--bold]',
  run: (editor) => editor.chain().focus().toggleBold().run(),
  isActive: (editor) => editor.isActive('bold'),
})
