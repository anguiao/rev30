import type { Command } from '@tiptap/core'
import type { Editor } from '@tiptap/vue-3'
import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import { setLinkAction, unsetLinkAction } from '../editor'
import { normalizeLinkHref } from '../href'
import {
  resolveRichTextLinkTarget,
  type RichTextLinkTarget,
  type RichTextLinkTargetSurface,
} from '../target'

export interface UseRichTextLinkEditorOptions {
  readonly editor: Editor
  readonly disabled?: MaybeRefOrGetter<boolean>
  readonly onClose?: () => void
}

export function useRichTextLinkEditor(options: UseRichTextLinkEditorOptions) {
  const editor = options.editor
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
  const canRemove = computed(
    () => !isDisabled.value && (target.value?.mode === 'edit' || target.value?.mode === 'set'),
  )

  function reset() {
    target.value = null
    draft.value = ''
  }

  function close() {
    if (!target.value) {
      return
    }

    reset()
    options.onClose?.()
  }

  watch(isDisabled, (disabled) => {
    if (disabled) {
      close()
    }
  })

  onBeforeUnmount(reset)

  function openTarget(nextTarget: RichTextLinkTarget) {
    if (isDisabled.value) {
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

    const chain = editor.chain()

    if (command) {
      chain.command(command)
    }

    const handled = chain.focus().run()

    if (handled) {
      close()
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
        : runTargetCommand(unsetLinkAction.command(currentTarget.range))
    }

    return runTargetCommand(setLinkAction.command(normalizedDraft.value, currentTarget.range))
  }

  function remove() {
    const currentTarget = target.value
    return canRemove.value && currentTarget
      ? runTargetCommand(unsetLinkAction.command(currentTarget.range))
      : false
  }

  function cancel() {
    if (!target.value) {
      return false
    }

    const handled = editor.commands.focus()

    close()
    return handled
  }

  function openDraft() {
    if (!canOpen.value) {
      return false
    }

    window.open(normalizedDraft.value, '_blank', 'noopener,noreferrer')
    return true
  }

  return {
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
    openDraft,
  }
}

export type RichTextLinkEditor = ReturnType<typeof useRichTextLinkEditor>
