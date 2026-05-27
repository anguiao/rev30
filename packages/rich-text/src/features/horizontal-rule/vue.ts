import { defineRichTextToolbarItem } from '../../core/toolbar'
import { horizontalRuleFeature } from './shared'

export const horizontalRuleToolbarItem = defineRichTextToolbarItem({
  key: horizontalRuleFeature.key,
  label: '分割线',
  icon: 'i-[lucide--minus]',
  run: (editor) => editor.chain().focus().setHorizontalRule().run(),
})
