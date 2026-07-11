import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { horizontalRuleAction } from './editor'

export const horizontalRuleToolbarItem = defineRichTextToolbarItem(horizontalRuleAction, {
  label: '分割线',
  icon: 'i-[lucide--minus]',
})
