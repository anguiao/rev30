import {
  computed,
  inject,
  onBeforeUnmount,
  provide,
  shallowRef,
  type InjectionKey,
  type Ref,
} from 'vue'

export type RichTextOverlayCloseReason = 'outside' | 'cancel' | 'invalidated'

type RichTextOverlayCloser = (reason: RichTextOverlayCloseReason) => void

export interface RichTextToolbarOverlay {
  readonly close: RichTextOverlayCloser
}

export function createRichTextOverlayState(host: Ref<HTMLElement | null>) {
  const activeToolbarOverlay = shallowRef<RichTextToolbarOverlay | null>(null)
  let quickBarCloser: RichTextOverlayCloser | null = null

  function openToolbarOverlay(overlay: RichTextToolbarOverlay) {
    if (activeToolbarOverlay.value === overlay) {
      return
    }

    const previousOverlay = activeToolbarOverlay.value
    activeToolbarOverlay.value = overlay
    quickBarCloser?.('outside')
    previousOverlay?.close('outside')
  }

  function closeToolbarOverlay(overlay: RichTextToolbarOverlay) {
    if (activeToolbarOverlay.value === overlay) {
      activeToolbarOverlay.value = null
    }
  }

  function registerQuickBarCloser(close: RichTextOverlayCloser) {
    quickBarCloser = close

    return () => {
      if (quickBarCloser === close) {
        quickBarCloser = null
      }
    }
  }

  return {
    host,
    target: computed(() => host.value ?? false),
    toolbarOverlayOpen: computed(() => activeToolbarOverlay.value !== null),
    openToolbarOverlay,
    closeToolbarOverlay,
    registerQuickBarCloser,
  }
}

type RichTextOverlayState = ReturnType<typeof createRichTextOverlayState>

export const richTextOverlayStateKey: InjectionKey<RichTextOverlayState> =
  Symbol('rich-text-overlay-state')

export function provideRichTextOverlayState(host: Ref<HTMLElement | null>) {
  provide(richTextOverlayStateKey, createRichTextOverlayState(host))
}

export function useRichTextOverlayState() {
  const state = inject(richTextOverlayStateKey)

  if (!state) {
    throw new Error('Rich text overlay state is not provided')
  }

  return state
}

export function useRichTextToolbarOverlay(close: RichTextOverlayCloser) {
  const state = useRichTextOverlayState()
  const overlay: RichTextToolbarOverlay = { close }

  function release() {
    state.closeToolbarOverlay(overlay)
  }

  onBeforeUnmount(release)

  return {
    target: state.target,
    open: () => state.openToolbarOverlay(overlay),
    close: release,
  }
}
