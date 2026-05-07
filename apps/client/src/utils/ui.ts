import { h } from 'vue'
import { NButton, type ButtonProps } from 'naive-ui'
import { useAuthStore } from '../stores/auth'

type TableActionOptions = {
  label: string
  accessCode: string
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

  if (!auth.can(accessCode)) {
    return null
  }

  const buttonProps: ButtonProps & Record<string, unknown> = {
    text: true,
    size: 'small',
    type,
    ...(testId === undefined ? {} : { 'data-test': testId }),
    ...(onClick === undefined ? {} : { onClick }),
  }

  return h(
    NButton,
    buttonProps,
    () => label,
  )
}

export function renderTableActions(actions: Array<ReturnType<typeof renderTableActionButton>>) {
  const visibleActions = actions.filter((action) => action !== null)

  return visibleActions.length === 0
    ? '-'
    : h('div', { class: 'flex flex-wrap items-center gap-2' }, visibleActions)
}
