import { defineRichTextToolbarItem } from '../../core/toolbar'
import { horizontalRuleFeature } from './shared'

export const horizontalRuleToolbarItem = defineRichTextToolbarItem({
  key: horizontalRuleFeature.key,
  label: horizontalRuleFeature.label,
  icon: horizontalRuleFeature.icon!,
  dataTest: 'rich-text-horizontal-rule',
  run: (editor) => editor.chain().focus().setHorizontalRule().run(),
})
