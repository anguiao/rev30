import { ref, toValue, type MaybeRefOrGetter } from 'vue'

export function useRichTextDropdownTrigger(disabled: MaybeRefOrGetter<boolean>) {
  const show = ref(false)

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || toValue(disabled)) {
      return
    }

    if (!show.value) {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        show.value = true
      }
      return
    }

    if (event.key === 'Tab') {
      show.value = false
      return
    }

    if (
      ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.key)
    ) {
      event.preventDefault()
    }
  }

  return { show, handleTriggerKeydown }
}
