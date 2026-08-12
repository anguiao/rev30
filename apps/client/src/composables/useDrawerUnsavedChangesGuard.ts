import { useDialog, type ButtonProps } from 'naive-ui'
import { watchEffect, type Ref } from 'vue'

type UseDrawerUnsavedChangesGuardOptions = {
  show: Ref<boolean>
  isDirty: Readonly<Ref<boolean>>
}

export function useDrawerUnsavedChangesGuard({
  show,
  isDirty,
}: UseDrawerUnsavedChangesGuardOptions) {
  const dialog = useDialog()

  function closeDrawer() {
    show.value = false
  }

  function requestClose() {
    if (!isDirty.value) {
      closeDrawer()
      return
    }

    const positiveButtonProps: ButtonProps & Record<string, unknown> = {
      type: 'warning',
      'data-test': 'unsaved-changes-discard-confirm',
    }
    const negativeButtonProps: ButtonProps & Record<string, unknown> = {
      'data-test': 'unsaved-changes-discard-cancel',
    }

    dialog.warning({
      title: '放弃未保存的更改？',
      content: '关闭后，未保存的内容将丢失。',
      positiveText: '放弃更改',
      negativeText: '继续编辑',
      positiveButtonProps,
      negativeButtonProps,
      onPositiveClick: closeDrawer,
    })
  }

  function handleDrawerShowUpdate(nextShow: boolean) {
    if (!nextShow) {
      requestClose()
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault()
  }

  watchEffect((onCleanup) => {
    if (!show.value || !isDirty.value) {
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
