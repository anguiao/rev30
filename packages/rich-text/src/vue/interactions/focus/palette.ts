import { focusEntryItem, isFocusItemEnabled, type FocusEntry } from './items'

const paletteItemSelector = '[data-rich-text-palette-item]'

function getPaletteItems(root: HTMLElement | null) {
  return Array.from(root?.querySelectorAll<HTMLElement>(paletteItemSelector) ?? [])
}

function getAdjacentItem(items: readonly HTMLElement[], item: HTMLElement, offset: -1 | 1) {
  const currentIndex = items.indexOf(item)
  return items[(currentIndex + offset + items.length) % items.length]!
}

export function focusRichTextPaletteItem(root: HTMLElement | null, entry: FocusEntry) {
  focusEntryItem(getPaletteItems(root).filter(isFocusItemEnabled), entry)
}

export function handleRichTextPaletteKeydown(
  event: KeyboardEvent,
  options: { root: HTMLElement | null; columns: number },
) {
  if (event.defaultPrevented || event.isComposing) {
    return
  }

  const items = getPaletteItems(options.root)
  const target =
    event.target instanceof Element ? event.target.closest<HTMLElement>(paletteItemSelector) : null
  const currentIndex = target ? items.indexOf(target) : -1

  if (!target || currentIndex < 0 || !isFocusItemEnabled(target)) {
    return
  }

  const enabledItems = items.filter(isFocusItemEnabled)
  let nextItem: HTMLElement

  switch (event.key) {
    case 'ArrowLeft':
      nextItem = getAdjacentItem(enabledItems, target, -1)
      break
    case 'ArrowRight':
      nextItem = getAdjacentItem(enabledItems, target, 1)
      break
    case 'ArrowUp':
    case 'ArrowDown': {
      const currentColumn = currentIndex % options.columns
      const columnItems = items.filter(
        (item, index) => index % options.columns === currentColumn && isFocusItemEnabled(item),
      )
      nextItem = getAdjacentItem(columnItems, target, event.key === 'ArrowUp' ? -1 : 1)
      break
    }
    case 'Home':
      nextItem = enabledItems[0]!
      break
    case 'End':
      nextItem = enabledItems.at(-1)!
      break
    default:
      return
  }

  event.preventDefault()
  event.stopPropagation()
  nextItem.focus()
}
