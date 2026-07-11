import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { boldAction } from './editor'

export const boldToolbarItem = defineRichTextToolbarItem(boldAction, {
  label: '加粗',
  icon: 'i-[lucide--bold]',
})
