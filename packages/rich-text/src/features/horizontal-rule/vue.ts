import { defineRichTextCommand } from '../../core/toolbar'
import { horizontalRuleFeature } from './shared'

export const horizontalRuleCommand = defineRichTextCommand({
  key: horizontalRuleFeature.key,
  label: '分割线',
  icon: 'i-[lucide--minus]',
  run: (editor) => editor.chain().focus().setHorizontalRule().run(),
})
