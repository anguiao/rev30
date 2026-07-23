import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { horizontalRuleFeature } from './shared'

export const horizontalRuleAction = defineRichTextAction(horizontalRuleFeature, {
  key: horizontalRuleFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().setHorizontalRule().run(),
})

export const horizontalRuleActionItem = defineRichTextActionItem(horizontalRuleAction, {
  label: '分割线',
  icon: 'i-[lucide--minus]',
  keywords: ['横线', 'divider', 'separator', 'horizontalrule', 'hr'],
})

export const horizontalRuleEditorFeature = defineRichTextEditorFeature(horizontalRuleFeature, {})
