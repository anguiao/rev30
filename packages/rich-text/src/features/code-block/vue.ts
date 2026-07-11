import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { codeBlockAction } from './editor'

export const codeBlockToolbarItem = defineRichTextToolbarItem(codeBlockAction, {
  label: '代码块',
  icon: 'i-[lucide--square-code]',
})
