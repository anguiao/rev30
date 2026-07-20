export function excludeRichTextMenuWrapperFromTabOrder(content: HTMLElement) {
  const parent = content.parentElement

  if (!parent) {
    return () => undefined
  }

  const wrapper = parent

  function syncTabIndex() {
    if (wrapper.tabIndex !== -1) {
      wrapper.tabIndex = -1
    }
  }

  const observer = new MutationObserver(syncTabIndex)
  observer.observe(wrapper, { attributes: true, attributeFilter: ['tabindex'] })
  syncTabIndex()

  return () => observer.disconnect()
}
