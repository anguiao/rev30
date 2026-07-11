import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { italicAction } from './editor'

export const italicToolbarItem = defineRichTextToolbarItem(italicAction, {
  label: '斜体',
  icon: 'i-[lucide--italic]',
})
