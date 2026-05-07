import { h } from 'vue'
import { NButton, type ButtonProps } from 'naive-ui'
import { useAuthStore } from '../stores/auth'

type TableActionOptions = {
  label: string
  accessCode: string
  type?: ButtonProps['type']
  testId?: string
}

export function renderTableActionButton({
  label,
  accessCode,
  type = 'primary',
  testId,
}: TableActionOptions) {
  const auth = useAuthStore()

  if (!auth.can(accessCode)) {
    return null
  }

  return h(
    NButton,
    {
      text: true,
      size: 'small',
      type,
      'data-test': testId,
    },
    () => label,
  )
}

export function renderTableActions(actions: Array<ReturnType<typeof renderTableActionButton>>) {
  const visibleActions = actions.filter((action) => action !== null)

  return visibleActions.length === 0
    ? '-'
    : h('div', { class: 'flex flex-wrap items-center gap-2' }, visibleActions)
}
