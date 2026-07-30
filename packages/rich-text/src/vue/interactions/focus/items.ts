export type FocusEntry = 'active' | 'first' | 'last'

export function isFocusItemEnabled(item: HTMLElement) {
  const disabled = item.getAttribute('disabled')

  return (
    (disabled === null || disabled === 'false') &&
    !item.matches(':disabled') &&
    item.getAttribute('aria-disabled') !== 'true'
  )
}

export function isFocusItemActive(item: HTMLElement) {
  return (
    item.getAttribute('aria-pressed') === 'true' || item.getAttribute('aria-selected') === 'true'
  )
}

export function focusEntryItem(items: readonly HTMLElement[], entry: FocusEntry) {
  let item: HTMLElement | undefined

  if (entry === 'last') {
    item = items.at(-1)
  } else if (entry === 'active') {
    item = items.find(isFocusItemActive) ?? items[0]
  } else {
    item = items[0]
  }

  item?.focus()
}
