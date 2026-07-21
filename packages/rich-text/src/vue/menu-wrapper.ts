import { nextTick } from 'vue'

export function excludeRichTextMenuWrapperFromTabOrder(content: HTMLElement) {
  void nextTick(() => {
    if (content.parentElement) {
      content.parentElement.tabIndex = -1
    }
  })
}
