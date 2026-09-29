import { onKeyStroke } from '@vueuse/core'
import { ref } from 'vue'
import type AdminMenuSearchDialog from './AdminMenuSearchDialog.vue'

export function useMenuSearch() {
  const isMenuSearchOpen = ref(false)
  const menuSearchDialog = ref<InstanceType<typeof AdminMenuSearchDialog> | null>(null)

  function openMenuSearch() {
    if (isMenuSearchOpen.value) {
      menuSearchDialog.value?.focusInput()
      return
    }

    isMenuSearchOpen.value = true
  }

  const usesMacShortcut = navigator.platform.startsWith('Mac')
  const shortcutLabel = usesMacShortcut ? '⌘K' : 'Ctrl+K'

  function handleShortcut(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.shiftKey ||
      (usesMacShortcut ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)
    ) {
      return
    }

    if (!isMenuSearchOpen.value) {
      const target = event.target
      // DialogProvider dialogs carry the modal class without aria-modal.
      const modal = document.querySelector(
        '[aria-modal="true"], .n-modal[role="dialog"], .n-modal[role="alertdialog"]',
      )
      if (
        (target instanceof Element &&
          target.closest(
            '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]',
          )) ||
        modal
      ) {
        return
      }
    }

    event.preventDefault()
    openMenuSearch()
  }

  onKeyStroke((event) => event.key.toLowerCase() === 'k', handleShortcut, { dedupe: true })

  return { isMenuSearchOpen, menuSearchDialog, shortcutLabel, openMenuSearch }
}
