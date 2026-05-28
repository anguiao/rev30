import { defineRichTextCommand } from '../../vue/toolbar/types'
import { italicFeature } from './shared'

export const italicCommand = defineRichTextCommand({
  key: italicFeature.key,
  label: '斜体',
  icon: 'i-[lucide--italic]',
  run: (editor) => editor.chain().focus().toggleItalic().run(),
  isActive: (editor) => editor.isActive('italic'),
})
