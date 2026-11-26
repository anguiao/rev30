import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, vi } from 'vitest'

enableAutoUnmount(afterEach)

beforeEach(() => {
  // Browsers queue one selectionchange task. Happy DOM fires it during the editor's DOM update.
  const dispatch = document.dispatchEvent.bind(document)
  let timer: number | undefined
  vi.spyOn(document, 'dispatchEvent').mockImplementation((event) => {
    if (event.type !== 'selectionchange' || event.eventPhase !== Event.NONE) return dispatch(event)
    timer ??= window.setTimeout(() => {
      timer = undefined
      dispatch(event)
    }, 0)
    return true
  })
  return () => window.clearTimeout(timer)
})
