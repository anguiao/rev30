import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { blockquoteAction } from './editor'

export const blockquoteToolbarItem = defineRichTextToolbarItem(blockquoteAction, {
  label: '引用',
  icon: 'i-[lucide--quote]',
})
