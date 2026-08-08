import { useMutationObserver } from '@vueuse/core'
import { ref, watch, type Ref } from 'vue'
import { isFocusItemActive, isFocusItemEnabled } from './items'

const itemAttribute = 'data-rich-text-toolbar-item'
const itemSelector = `[${itemAttribute}]`
const rootSelector = '[data-rich-text-toolbar-root]'

export function useRichTextRovingFocus(root: Readonly<Ref<HTMLElement | null>>) {
  const rememberedItem = ref<HTMLElement | null>(null)
  const rememberedItemKey = ref<string | null>(null)

  function belongsToRoot(item: HTMLElement) {
    return root.value !== null && item.closest(rootSelector) === root.value
  }

  function getItems() {
    return Array.from(root.value?.querySelectorAll<HTMLElement>(itemSelector) ?? []).filter(
      belongsToRoot,
    )
  }

  function getItemFromTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
      return null
    }

    const item = target.closest<HTMLElement>(itemSelector)
    return item && belongsToRoot(item) ? item : null
  }

  function setCurrentItem(item: HTMLElement | null) {
    for (const candidate of getItems()) {
      const tabIndex = candidate === item ? 0 : -1

      if (candidate.tabIndex !== tabIndex) {
        candidate.tabIndex = tabIndex
      }
    }

    if (item) {
      rememberedItem.value = item
      rememberedItemKey.value = item.getAttribute(itemAttribute)
    }
  }

  function sync() {
    const allItems = getItems()
    const enabledItems = allItems.filter(isFocusItemEnabled)
    const previousItem = rememberedItem.value
    const rememberedKey = rememberedItemKey.value
    const previousHadFocus = previousItem !== null && previousItem === document.activeElement
    let rememberedEnabledItem =
      previousItem && enabledItems.includes(previousItem) ? previousItem : undefined

    if (!rememberedEnabledItem && rememberedKey !== null) {
      rememberedEnabledItem = enabledItems.find(
        (item) => item.getAttribute(itemAttribute) === rememberedKey,
      )
    }

    const previousIndex = previousItem ? allItems.indexOf(previousItem) : -1
    const nextItem =
      rememberedEnabledItem ??
      (previousItem === null ? enabledItems.find(isFocusItemActive) : undefined) ??
      enabledItems.find((item) => item.tabIndex === 0) ??
      allItems.slice(previousIndex + 1).find(isFocusItemEnabled) ??
      enabledItems[0] ??
      null

    setCurrentItem(nextItem)

    if (previousHadFocus && nextItem && previousItem !== nextItem) {
      nextItem.focus()
    }
  }

  function focusEntry() {
    sync()

    const items = getItems().filter(isFocusItemEnabled)
    const item = items.find((item) => item.tabIndex === 0) ?? items[0]

    if (!item) {
      return false
    }

    item.focus()
    return true
  }

  function containsItem(target: EventTarget | null) {
    return getItemFromTarget(target) !== null
  }

  function handleFocusIn(event: FocusEvent) {
    const item = getItemFromTarget(event.target)

    if (!item || !isFocusItemEnabled(item)) {
      return
    }

    setCurrentItem(item)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) {
      return
    }

    const item = getItemFromTarget(event.target)

    if (!item || !isFocusItemEnabled(item)) {
      return
    }

    const allItems = getItems()
    const items = allItems.filter(isFocusItemEnabled)
    const currentIndex = items.indexOf(item)
    let nextIndex: number

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + items.length) % items.length
        break
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % items.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = items.length - 1
        break
      default:
        return
    }

    const nextItem = items[nextIndex]!

    event.preventDefault()
    event.stopPropagation()
    setCurrentItem(nextItem)
    nextItem.focus()
  }

  useMutationObserver(root, sync, {
    attributes: true,
    attributeFilter: [itemAttribute, 'aria-disabled', 'disabled'],
    childList: true,
    subtree: true,
  })
  watch(root, sync, { flush: 'post' })

  return {
    containsItem,
    focusEntry,
    handleFocusIn,
    handleKeydown,
  }
}
