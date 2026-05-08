import { h } from 'vue'
import { NButton, type ButtonProps } from 'naive-ui'
import { useAuthStore } from '../stores/auth'

type TableActionOptions = {
  label: string
  accessCode: string | string[]
  type?: ButtonProps['type']
  testId?: string
  onClick?: () => void
}

export function renderTableActionButton({
  label,
  accessCode,
  type = 'primary',
  testId,
  onClick,
}: TableActionOptions) {
  const auth = useAuthStore()
  const hasPermission = Array.isArray(accessCode) ? auth.canAll(accessCode) : auth.can(accessCode)

  if (!hasPermission) {
    return null
  }

  return h(
    NButton,
    {
      text: true,
      size: 'small',
      type,
      ...(testId === undefined ? {} : { 'data-test': testId }),
      ...(onClick === undefined ? {} : { onClick }),
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
