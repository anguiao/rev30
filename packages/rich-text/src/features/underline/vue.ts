import { defineRichTextToolbarItem } from '../../core/toolbar'
import { underlineFeature } from './shared'

export const underlineToolbarItem = defineRichTextToolbarItem({
  key: underlineFeature.key,
  label: '下划线',
  icon: 'i-[lucide--underline]',
  run: (editor) => editor.chain().focus().toggleUnderline().run(),
  isActive: (editor) => editor.isActive('underline'),
})
