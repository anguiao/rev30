import { defineRichTextToolbarItem } from '../../core/toolbar'
import { boldFeature } from './shared'

export const boldToolbarItem = defineRichTextToolbarItem({
  key: boldFeature.key,
  label: boldFeature.label,
  icon: boldFeature.icon!,
  dataTest: 'rich-text-bold',
  run: (editor) => editor.chain().focus().toggleBold().run(),
  isActive: (editor) => editor.isActive('bold'),
})
