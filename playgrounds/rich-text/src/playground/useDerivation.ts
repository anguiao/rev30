import { deriveRichTextContent } from '@rev30/rich-text/server'
import type { RichTextServerPreset } from '@rev30/rich-text/server'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import { onUnmounted, ref, shallowRef, type Ref } from 'vue'

export type DerivationStatus = 'ready' | 'pending' | 'error'

export interface DerivedRichTextContent {
  readonly json: RichTextDocument
  readonly text: string
  readonly html: string
}

export function useDerivation(document: Ref<RichTextDocument>, serverPreset: RichTextServerPreset) {
  const status = ref<DerivationStatus>('pending')
  const revision = ref(0)
  const resultRevision = ref<number | null>(null)
  const result = shallowRef<DerivedRichTextContent | null>(null)
  const error = shallowRef<unknown>(null)
  let timer: number | undefined

  function derive(currentRevision: number, currentDocument: RichTextDocument) {
    try {
      const derived = deriveRichTextContent(currentDocument, serverPreset)
      result.value = derived
      resultRevision.value = currentRevision
      error.value = null
      status.value = 'ready'
    } catch (cause) {
      error.value = cause
      status.value = 'error'
    }
  }

  function clearTimer() {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
  }

  function schedule() {
    clearTimer()
    revision.value += 1
    const currentRevision = revision.value
    status.value = 'pending'
    timer = window.setTimeout(() => {
      timer = undefined
      derive(currentRevision, document.value)
    }, 300)
  }

  function deriveImmediately() {
    clearTimer()
    revision.value += 1
    derive(revision.value, document.value)
  }

  deriveImmediately()

  onUnmounted(clearTimer)

  return {
    status,
    revision,
    resultRevision,
    result,
    error,
    schedule,
    deriveImmediately,
  }
}
