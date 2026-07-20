import { defineRichTextActionItem } from '../../vue/action-item'
import { paragraphAction } from './editor'

export const paragraphActionItem = defineRichTextActionItem(paragraphAction, {
  label: '正文',
  icon: 'i-[lucide--pilcrow]',
})
