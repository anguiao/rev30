import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { headingActions } from './editor'

export const headingToolbarItems = [
  defineRichTextToolbarItem(headingActions[0], {
    label: '一级标题',
    icon: 'i-[lucide--heading-1]',
  }),
  defineRichTextToolbarItem(headingActions[1], {
    label: '二级标题',
    icon: 'i-[lucide--heading-2]',
  }),
  defineRichTextToolbarItem(headingActions[2], {
    label: '三级标题',
    icon: 'i-[lucide--heading-3]',
  }),
] as const
