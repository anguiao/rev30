import type { Editor } from '@tiptap/core'

export type RichTextIconClass = `i-[${string}--${string}]`

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
  run: (editor: Editor) => boolean
  isActive?: (editor: Editor) => boolean
  isDisabled?: (editor: Editor) => boolean
}

export function defineRichTextToolbarItem(item: RichTextToolbarItem): RichTextToolbarItem {
  return item
}
