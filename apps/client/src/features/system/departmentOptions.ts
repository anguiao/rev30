import type { DepartmentTreeNode } from '@rev30/shared'
import type { TreeSelectOption } from 'naive-ui'

type DepartmentTreeSelectOptions = {
  disabledDepartmentId?: string
}

function toDepartmentTreeSelectOptionsInternal(
  nodes: DepartmentTreeNode[],
  options: DepartmentTreeSelectOptions = {},
  inheritedDisabled = false,
): TreeSelectOption[] {
  const disabledDepartmentId = options.disabledDepartmentId

  return nodes.map((node) => {
    const disabled = inheritedDisabled || node.id === disabledDepartmentId
    const option: TreeSelectOption = {
      key: node.id,
      label: `${node.name} (${node.code})`,
      ...(disabled ? { disabled: true } : {}),
    }

    if (node.children.length > 0) {
      option.children = toDepartmentTreeSelectOptionsInternal(node.children, options, disabled)
    }

    return option
  })
}

export function toDepartmentTreeSelectOptions(
  nodes: DepartmentTreeNode[],
  options: DepartmentTreeSelectOptions = {},
): TreeSelectOption[] {
  return toDepartmentTreeSelectOptionsInternal(nodes, options)
}
