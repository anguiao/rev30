import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { strikeAction } from './editor'

export const strikeToolbarItem = defineRichTextToolbarItem(strikeAction, {
  label: '删除线',
  icon: 'i-[lucide--strikethrough]',
})
