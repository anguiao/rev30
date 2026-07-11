import { defineRichTextToolbarItem } from '../../vue/toolbar'
import { textAlignOptions } from './alignments'
import { textAlignActions } from './editor'

export const textAlignToolbarItems = textAlignOptions.map((alignment, index) =>
  defineRichTextToolbarItem(textAlignActions[index]!, {
    label: alignment.label,
    icon: alignment.icon,
  }),
)
