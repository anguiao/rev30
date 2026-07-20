import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { onBeforeUnmount, onMounted, readonly, shallowRef, type Ref } from 'vue'
import { richTextSurfaceTransactionMeta } from './selection'

export type RichTextSurfaceCloseReason = 'outside' | 'cancel' | 'invalidated'

export type RichTextSurfaceCloser = (reason: RichTextSurfaceCloseReason) => void

interface RichTextToolbarLayer {
  readonly owner: symbol
  readonly close: RichTextSurfaceCloser
}

export interface RichTextSurfaceCoordinator {
  readonly isQuickbarSuppressed: Readonly<Ref<boolean>>
  claimToolbarLayer: (owner: symbol, close: RichTextSurfaceCloser) => void
  releaseToolbarLayer: (owner: symbol) => void
  registerQuickbarCloser: (close: RichTextSurfaceCloser) => () => void
  closeQuickbar: RichTextSurfaceCloser
}

const coordinators = new WeakMap<Editor, RichTextSurfaceCoordinator>()

function createRichTextSurfaceCoordinator(editor: Editor): RichTextSurfaceCoordinator {
  const activeToolbarLayer = shallowRef<RichTextToolbarLayer | null>(null)
  const isQuickbarSuppressed = shallowRef(false)
  let quickbarCloser: RichTextSurfaceCloser | null = null

  function closeQuickbar(reason: RichTextSurfaceCloseReason) {
    quickbarCloser?.(reason)
  }

  function claimToolbarLayer(owner: symbol, close: RichTextSurfaceCloser) {
    const previousLayer = activeToolbarLayer.value

    if (previousLayer?.owner === owner) {
      activeToolbarLayer.value = { owner, close }
      isQuickbarSuppressed.value = true
      return
    }

    closeQuickbar('outside')

    if (previousLayer) {
      activeToolbarLayer.value = null
      previousLayer.close('outside')
    }

    activeToolbarLayer.value = { owner, close }
    isQuickbarSuppressed.value = true

    if (!editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta('richTextSurfaceCoordinator', owner))
    }
  }

  function releaseToolbarLayer(owner: symbol) {
    if (activeToolbarLayer.value?.owner !== owner) {
      return
    }

    activeToolbarLayer.value = null
    isQuickbarSuppressed.value = false

    if (!editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta('richTextSurfaceCoordinator', false))
    }
  }

  function registerQuickbarCloser(close: RichTextSurfaceCloser) {
    quickbarCloser = close

    return () => {
      if (quickbarCloser === close) {
        quickbarCloser = null
      }
    }
  }

  return {
    isQuickbarSuppressed: readonly(isQuickbarSuppressed),
    claimToolbarLayer,
    releaseToolbarLayer,
    registerQuickbarCloser,
    closeQuickbar,
  }
}

export function getRichTextSurfaceCoordinator(editor: Editor): RichTextSurfaceCoordinator {
  const existing = coordinators.get(editor)

  if (existing) {
    return existing
  }

  const coordinator = createRichTextSurfaceCoordinator(editor)
  coordinators.set(editor, coordinator)
  return coordinator
}

export function useRichTextToolbarLayer(editor: Editor, close: RichTextSurfaceCloser) {
  const owner = Symbol('rich-text-toolbar-layer')
  const coordinator = getRichTextSurfaceCoordinator(editor)

  onBeforeUnmount(() => {
    coordinator.releaseToolbarLayer(owner)
  })

  return {
    owner,
    claim: () => coordinator.claimToolbarLayer(owner, close),
    release: () => coordinator.releaseToolbarLayer(owner),
  }
}

export function useRichTextTargetInvalidation(
  editor: Editor,
  owner: symbol,
  isActive: () => boolean,
  invalidate: () => void,
) {
  function handleTransaction({ transaction }: { transaction: Transaction }) {
    if (
      isActive() &&
      transaction.docChanged &&
      transaction.getMeta(richTextSurfaceTransactionMeta) !== owner
    ) {
      invalidate()
    }
  }

  onMounted(() => {
    editor.on('transaction', handleTransaction)
  })

  onBeforeUnmount(() => {
    editor.off('transaction', handleTransaction)
  })
}
