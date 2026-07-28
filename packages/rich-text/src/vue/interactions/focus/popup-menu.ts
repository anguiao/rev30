import { nextTick } from 'vue'
import { focusEntryItem, isFocusItemEnabled, type FocusEntry } from './items'

const menuItemSelector = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'

function getEnabledMenuItems(menu: HTMLElement | null) {
  return Array.from(menu?.querySelectorAll<HTMLElement>(menuItemSelector) ?? []).filter(
    (item) => item.closest('[role="menu"]') === menu && isFocusItemEnabled(item),
  )
}

function getMenu(scope: HTMLElement | null) {
  if (scope?.matches('[role="menu"]')) {
    return scope
  }

  return scope?.querySelector<HTMLElement>('[role="menu"]') ?? null
}

export function focusRichTextMenuItem(scope: HTMLElement | null, entry: FocusEntry) {
  focusEntryItem(getEnabledMenuItems(getMenu(scope)), entry)
}

export function handleRichTextMenuKeydown(
  event: KeyboardEvent,
  options: {
    trigger: HTMLElement | null
    close: () => void
    orientation?: 'horizontal' | 'vertical'
  },
) {
  if (event.defaultPrevented || event.isComposing) {
    return
  }

  const eventTarget = event.target instanceof Element ? event.target : null
  const menu = eventTarget?.closest<HTMLElement>('[role="menu"]') ?? null
  const target = eventTarget?.closest<HTMLElement>(menuItemSelector)
  const items = getEnabledMenuItems(menu)
  const currentIndex = target ? items.indexOf(target) : -1

  if (event.key === 'Escape') {
    if (!menu) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    options.close()
    void nextTick(() => options.trigger?.focus())
    return
  }

  if (event.key === 'Tab' && menu) {
    queueMicrotask(options.close)
    return
  }

  if (!target || currentIndex < 0) {
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    target.click()
    return
  }

  const previousKey = options.orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  const nextKey = options.orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'

  if (![previousKey, nextKey, 'Home', 'End'].includes(event.key)) {
    return
  }

  let nextIndex: number

  if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = items.length - 1
  } else {
    const offset = event.key === nextKey ? 1 : -1
    nextIndex = (currentIndex + offset + items.length) % items.length
  }

  event.preventDefault()
  event.stopPropagation()
  items[nextIndex]!.focus()
}
