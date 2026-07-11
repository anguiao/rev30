import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { listActions } from './editor'

export const listToolbarItems = [
  defineRichTextToolbarItem(listActions[0], {
    label: '无序列表',
    icon: 'i-[lucide--list]',
  }),
  defineRichTextToolbarItem(listActions[1], {
    label: '有序列表',
    icon: 'i-[lucide--list-ordered]',
  }),
] as const
