import { shallowRef } from 'vue'
import { createRichTextOverlayState, richTextOverlayStateKey } from '../../src/vue/overlay-state'

export function createTestRichTextOverlayState() {
  const host = shallowRef<HTMLElement | null>(document.body)
  const state = createRichTextOverlayState(host)

  return {
    state,
    provide: {
      [richTextOverlayStateKey as symbol]: state,
    },
  }
}
