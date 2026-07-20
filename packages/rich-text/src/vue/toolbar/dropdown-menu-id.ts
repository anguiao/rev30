let nextRichTextToolbarDropdownMenuId = 0

export function createRichTextToolbarDropdownMenuId() {
  nextRichTextToolbarDropdownMenuId += 1
  return `rich-text-toolbar-dropdown-${nextRichTextToolbarDropdownMenuId}`
}
