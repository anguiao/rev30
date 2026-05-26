import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { defineRichTextFeature } from '../../core/feature'

export const horizontalRuleFeature = defineRichTextFeature({
  key: 'horizontal-rule',
  label: '分割线',
  icon: 'i-[lucide--minus]',
  extension: () => HorizontalRule,
})
