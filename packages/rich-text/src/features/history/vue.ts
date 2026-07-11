import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { historyActions } from './editor'

export const historyToolbarItems = [
  defineRichTextToolbarItem(historyActions[0], {
    label: '撤销',
    icon: 'i-[lucide--undo-2]',
  }),
  defineRichTextToolbarItem(historyActions[1], {
    label: '重做',
    icon: 'i-[lucide--redo-2]',
  }),
] as const
