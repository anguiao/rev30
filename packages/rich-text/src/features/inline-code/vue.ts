import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { inlineCodeAction } from './editor'

export const inlineCodeToolbarItem = defineRichTextToolbarItem(inlineCodeAction, {
  label: '行内代码',
  icon: 'i-[lucide--code]',
})
