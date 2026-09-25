import { useDialog, type ButtonProps } from 'naive-ui'
import { inject, watchEffect, type Ref } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'

type UseDrawerUnsavedChangesGuardOptions = {
  show: Ref<boolean>
  isDirty: Readonly<Ref<boolean>>
  isSaving: Readonly<Ref<boolean>>
}

export function useDrawerUnsavedChangesGuard({
  show,
  isDirty,
  isSaving,
}: UseDrawerUnsavedChangesGuardOptions) {
  const dialog = useDialog()
  let pendingDiscard: Promise<boolean> | null = null

  function closeDrawer() {
    if (isSaving.value) return

    show.value = false
  }

  async function requestClose() {
    if (isSaving.value) return

    if (!isDirty.value || (await confirmDiscard())) {
      closeDrawer()
    }
  }

  function confirmDiscard() {
    if (pendingDiscard !== null) return pendingDiscard

    const positiveButtonProps: ButtonProps & Record<string, unknown> = {
      type: 'warning',
      'data-test': 'unsaved-changes-discard-confirm',
    }
    const negativeButtonProps: ButtonProps & Record<string, unknown> = {
      'data-test': 'unsaved-changes-discard-cancel',
    }

    pendingDiscard = new Promise<boolean>((resolve) => {
      dialog.warning({
        title: '放弃未保存的更改？',
        content: '离开后，未保存的内容将丢失。',
        positiveText: '放弃更改',
        negativeText: '继续编辑',
        positiveButtonProps,
        negativeButtonProps,
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false),
        onEsc: () => resolve(false),
        onMaskClick: () => resolve(false),
        onAfterLeave: () => resolve(false),
      })
    }).finally(() => {
      pendingDiscard = null
    })

    return pendingDiscard
  }

  if (inject(matchedRouteKey, undefined)?.value !== undefined) {
    onBeforeRouteLeave(async () => {
      if (!show.value) return true
      if (isSaving.value) return blockPendingSave()
      if (isDirty.value && !(await confirmDiscard())) return false

      return isSaving.value ? blockPendingSave() : true
    })
  }

  function blockPendingSave() {
    dialog.info({
      title: '正在保存',
      content: '请等待保存完成后再离开。',
      positiveText: '确定',
    })
    return false
  }

  function handleDrawerShowUpdate(nextShow: boolean) {
    if (!nextShow) {
      void requestClose()
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault()
  }

  watchEffect((onCleanup) => {
    if (!show.value || (!isDirty.value && !isSaving.value)) {
      return
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    onCleanup(() => window.removeEventListener('beforeunload', handleBeforeUnload))
  })

  return {
    requestClose,
    handleDrawerShowUpdate,
  }
}
