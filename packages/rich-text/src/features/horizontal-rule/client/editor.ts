import { defineRichTextAction, defineRichTextActionItem } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { horizontalRuleFeature } from '../core/feature'

export const horizontalRuleAction = defineRichTextAction(horizontalRuleFeature, {
  key: horizontalRuleFeature.key,
  command: ({ chain }) => chain().focus().setHorizontalRule().run(),
})

export const horizontalRuleActionItem = defineRichTextActionItem(horizontalRuleAction, {
  label: '分割线',
  icon: 'i-[lucide--minus]',
  keywords: ['横线', 'divider', 'separator', 'horizontalrule', 'hr'],
})

export const horizontalRuleEditorFeature = defineRichTextEditorFeature(horizontalRuleFeature, {})
