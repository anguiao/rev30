import { defineRichTextToolbarItem } from '../../core/toolbar'
import { underlineFeature } from './shared'

export const underlineToolbarItem = defineRichTextToolbarItem({
  key: underlineFeature.key,
  label: underlineFeature.label,
  icon: underlineFeature.icon!,
  dataTest: 'rich-text-underline',
  run: (editor) => editor.chain().focus().toggleUnderline().run(),
  isActive: (editor) => editor.isActive('underline'),
})
