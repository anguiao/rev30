import type { Editor } from '@tiptap/vue-3'
import type { RichTextIconClass } from './feature'

export interface RichTextToolbarLayoutGroup {
  key: string
  items: string[]
}

export interface RichTextToolbarLayout {
  groups: RichTextToolbarLayoutGroup[]
}

export function defineRichTextToolbarLayout(
  groups: RichTextToolbarLayoutGroup[],
): RichTextToolbarLayout {
  return { groups }
}

export interface RichTextToolbarItem {
  key: string
  label: string
  icon: RichTextIconClass
  dataTest: string
  run: (editor: Editor) => boolean
  isActive?: (editor: Editor) => boolean
  isDisabled?: (editor: Editor) => boolean
}

export function defineRichTextToolbarItem(item: RichTextToolbarItem): RichTextToolbarItem {
  return item
}
