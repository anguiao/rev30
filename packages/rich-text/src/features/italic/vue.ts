import { defineRichTextToolbarItem } from '../../core/toolbar'
import { italicFeature } from './shared'

export const italicToolbarItem = defineRichTextToolbarItem({
  key: italicFeature.key,
  label: '斜体',
  icon: 'i-[lucide--italic]',
  run: (editor) => editor.chain().focus().toggleItalic().run(),
  isActive: (editor) => editor.isActive('italic'),
})
