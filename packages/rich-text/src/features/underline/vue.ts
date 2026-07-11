import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { underlineAction } from './editor'

export const underlineToolbarItem = defineRichTextToolbarItem(underlineAction, {
  label: '下划线',
  icon: 'i-[lucide--underline]',
})
