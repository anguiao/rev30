import { h } from 'vue'
import { NButton, type ButtonProps, type SelectOption, type TreeOption } from 'naive-ui'
import { useAuthStore } from '../stores/auth'

type TableActionOptions = {
  label: string
  accessCode: string | string[]
  type?: ButtonProps['type']
  testId?: string
  disabled?: boolean
  onClick?: () => void
}

type TreeOptionNode<TNode> = {
  id: string
  name: string
  children: readonly TNode[]
}

type TreeOptionsConfig<TNode> = {
  label?: (node: TNode) => string
  disabledSubtreeId?: string
}

type SelectOptionNode = {
  id: string
  name: string
}

type SelectOptionsConfig<TNode> = {
  label: (node: TNode) => string
  value: (node: TNode) => string | number
}

export function renderTableActionButton({
  label,
  accessCode,
  type = 'primary',
  testId,
  disabled = false,
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
      disabled,
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

function toTreeOptionsInternal<TNode extends TreeOptionNode<TNode>>(
  nodes: readonly TNode[],
  config: TreeOptionsConfig<TNode>,
  inheritedDisabled = false,
): TreeOption[] {
  return nodes.map((node) => {
    const disabled = inheritedDisabled || node.id === config.disabledSubtreeId
    const option: TreeOption = {
      key: node.id,
      label: config.label?.(node) ?? node.name,
      disabled,
    }

    if (node.children.length > 0) {
      option.children = toTreeOptionsInternal(node.children, config, disabled)
    }

    return option
  })
}

export function toTreeOptions<TNode extends TreeOptionNode<TNode>>(
  nodes: readonly TNode[],
  config: TreeOptionsConfig<TNode> = {},
): TreeOption[] {
  return toTreeOptionsInternal(nodes, config)
}

export function toSelectOptions<TNode extends SelectOptionNode>(
  nodes: readonly TNode[],
): SelectOption[]
export function toSelectOptions<TNode>(
  nodes: readonly TNode[],
  config: SelectOptionsConfig<TNode>,
): SelectOption[]
export function toSelectOptions<TNode>(
  nodes: readonly TNode[],
  config?: SelectOptionsConfig<TNode>,
): SelectOption[] {
  return nodes.map((node) => ({
    label: config?.label(node) ?? (node as SelectOptionNode).name,
    value: config?.value(node) ?? (node as SelectOptionNode).id,
  }))
}
