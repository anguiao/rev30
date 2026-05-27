import { defineRichTextToolbarItem } from '../../core/toolbar'
import { boldFeature } from './shared'

export const boldToolbarItem = defineRichTextToolbarItem({
  key: boldFeature.key,
  label: '加粗',
  icon: 'i-[lucide--bold]',
  run: (editor) => editor.chain().focus().toggleBold().run(),
  isActive: (editor) => editor.isActive('bold'),
})
