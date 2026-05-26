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
