import { defineRichTextToolbarItem } from '../../core/toolbar'
import { italicFeature } from './shared'

export const italicToolbarItem = defineRichTextToolbarItem({
  key: italicFeature.key,
  label: italicFeature.label,
  icon: italicFeature.icon!,
  dataTest: 'rich-text-italic',
  run: (editor) => editor.chain().focus().toggleItalic().run(),
  isActive: (editor) => editor.isActive('italic'),
})
