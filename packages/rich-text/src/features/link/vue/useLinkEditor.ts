import type { Command, Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import { markRichTextSurfaceTransactionCommand } from '../../../vue/selection'
import {
  useRichTextTargetInvalidation,
  type RichTextSurfaceCloseReason,
} from '../../../vue/surface-coordinator'
import { setLinkAction, unsetLinkAction } from '../editor'
import { normalizeLinkHref } from '../href'
import {
  isRichTextLinkTargetValid,
  resolveRichTextLinkTarget,
  type RichTextLinkTarget,
  type RichTextLinkTargetSurface,
} from '../target'

export type RichTextLinkEditorCloseReason = RichTextSurfaceCloseReason | 'success'

export interface UseRichTextLinkEditorOptions {
  readonly editor: Editor
  readonly disabled?: MaybeRefOrGetter<boolean>
  readonly onClose?: (reason: RichTextLinkEditorCloseReason) => void
}

function setLinkTargetSelectionCommand(target: RichTextLinkTarget): Command {
  return ({ dispatch, tr }) => {
    if (dispatch) {
      tr.setSelection(TextSelection.create(tr.doc, target.range.from, target.range.to))
      tr.setStoredMarks(target.storedMarks)
    }

    return true
  }
}

function restoreLinkTargetSelectionCommand(target: RichTextLinkTarget): Command {
  return ({ dispatch, tr }) => {
    if (!dispatch) {
      return true
    }

    const storedMarks = tr.storedMarks
    tr.setSelection(target.selection.bookmark.map(tr.mapping).resolve(tr.doc))

    if (target.selection.empty) {
      tr.setStoredMarks(storedMarks)
    }

    return true
  }
}

function restoreOriginalLinkTargetSelectionCommand(target: RichTextLinkTarget): Command {
  return ({ dispatch, tr }) => {
    if (dispatch) {
      tr.setSelection(target.selection.bookmark.map(tr.mapping).resolve(tr.doc))
      tr.setStoredMarks(target.storedMarks)
    }

    return true
  }
}

export function useRichTextLinkEditor(options: UseRichTextLinkEditorOptions) {
  const editor = options.editor
  const owner = Symbol('rich-text-link-editor')
  const target = shallowRef<RichTextLinkTarget | null>(null)
  const draft = ref('')
  const isDisabled = computed(
    () =>
      (options.disabled === undefined ? false : toValue(options.disabled)) || !editor.isEditable,
  )
  const normalizedDraft = computed(() => normalizeLinkHref(draft.value))
  const trimmedDraft = computed(() => draft.value.trim())
  const isInvalid = computed(() => trimmedDraft.value !== '' && normalizedDraft.value === '')
  const canApply = computed(() => !isDisabled.value && !isInvalid.value)
  const canOpen = computed(
    () => !isDisabled.value && trimmedDraft.value !== '' && normalizedDraft.value !== '',
  )
  const canRemove = computed(() => !isDisabled.value && target.value?.hasLinkMarks === true)

  function reset() {
    target.value = null
    draft.value = ''
  }

  function close(reason: RichTextLinkEditorCloseReason) {
    if (!target.value) {
      return
    }

    reset()
    options.onClose?.(reason)
  }

  function invalidate() {
    close('invalidated')
  }

  useRichTextTargetInvalidation(editor, owner, () => target.value !== null, invalidate)

  watch(isDisabled, (disabled) => {
    if (disabled) {
      invalidate()
    }
  })

  onBeforeUnmount(reset)

  function openTarget(nextTarget: RichTextLinkTarget) {
    if (isDisabled.value || !isRichTextLinkTargetValid(editor, nextTarget)) {
      return false
    }

    target.value = nextTarget
    draft.value = nextTarget.mode === 'edit' ? nextTarget.href : ''
    return true
  }

  function open(surface: RichTextLinkTargetSurface) {
    const nextTarget = resolveRichTextLinkTarget(editor, surface)
    return nextTarget ? openTarget(nextTarget) : false
  }

  function runTargetCommand(command?: Command) {
    const currentTarget = target.value
    if (!currentTarget || isDisabled.value) {
      return false
    }

    if (!isRichTextLinkTargetValid(editor, currentTarget)) {
      invalidate()
      return false
    }

    const chain = editor
      .chain()
      .command(markRichTextSurfaceTransactionCommand(owner))
      .command(setLinkTargetSelectionCommand(currentTarget))

    if (command) {
      chain.command(command)
    }

    const handled = chain.command(restoreLinkTargetSelectionCommand(currentTarget)).focus().run()

    if (handled) {
      close('success')
    }

    return handled
  }

  function apply() {
    const currentTarget = target.value
    if (!currentTarget || !canApply.value) {
      return false
    }

    if (trimmedDraft.value === '') {
      return currentTarget.mode === 'create'
        ? runTargetCommand()
        : runTargetCommand(unsetLinkAction.command())
    }

    return runTargetCommand(setLinkAction.command(normalizedDraft.value))
  }

  function remove() {
    return canRemove.value ? runTargetCommand(unsetLinkAction.command()) : false
  }

  function cancel() {
    const currentTarget = target.value
    if (!currentTarget) {
      return false
    }

    if (!isRichTextLinkTargetValid(editor, currentTarget)) {
      invalidate()
      return false
    }

    const handled = editor
      .chain()
      .command(markRichTextSurfaceTransactionCommand(owner))
      .command(restoreOriginalLinkTargetSelectionCommand(currentTarget))
      .focus()
      .run()

    close('cancel')
    return handled
  }

  function closeFromOutside() {
    close('outside')
  }

  function openDraft() {
    if (!canOpen.value) {
      return false
    }

    window.open(normalizedDraft.value, '_blank', 'noopener,noreferrer')
    return true
  }

  return {
    owner,
    target,
    draft,
    isOpen: computed(() => target.value !== null),
    isDisabled,
    isInvalid,
    canApply,
    canOpen,
    canRemove,
    normalizedDraft,
    open,
    openTarget,
    apply,
    remove,
    cancel,
    close,
    closeFromOutside,
    invalidate,
    openDraft,
  }
}

export type RichTextLinkEditor = ReturnType<typeof useRichTextLinkEditor>
