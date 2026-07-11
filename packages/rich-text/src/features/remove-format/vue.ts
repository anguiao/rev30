import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { removeFormatAction } from './editor'

export const removeFormatToolbarItem = defineRichTextToolbarItem(removeFormatAction, {
  label: '清除格式',
  icon: 'i-[lucide--eraser]',
})
