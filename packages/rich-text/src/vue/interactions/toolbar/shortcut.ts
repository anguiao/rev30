import type { Editor } from '@tiptap/vue-3'
import { useEventListener } from '@vueuse/core'
import { onBeforeUnmount, watch } from 'vue'

export const toolbarShortcut = 'Alt+F10'

export function useToolbarShortcut(
  editor: Editor,
  enterToolbar: () => boolean,
  isEnabled: () => boolean,
) {
  const editorElement = editor.view.dom
  const initialShortcuts = editorElement.getAttribute('aria-keyshortcuts')

  function setShortcuts(shortcuts: string | null) {
    if (shortcuts === null) {
      editorElement.removeAttribute('aria-keyshortcuts')
      return
    }

    editorElement.setAttribute('aria-keyshortcuts', shortcuts)
  }

  function syncShortcuts() {
    const shortcuts = new Set(initialShortcuts?.split(/\s+/).filter(Boolean) ?? [])

    if (isEnabled()) {
      shortcuts.add(toolbarShortcut)
    }

    setShortcuts(Array.from(shortcuts).join(' ') || null)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.key !== 'F10' ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !editor.isEditable
    ) {
      return
    }

    if (!enterToolbar()) {
      return
    }

    event.preventDefault()
  }

  useEventListener(editorElement, 'keydown', handleKeydown)
  watch(isEnabled, syncShortcuts, { immediate: true })
  onBeforeUnmount(() => setShortcuts(initialShortcuts))
}
