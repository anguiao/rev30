export type TreeArrayItem = {
  id: string
  parentId: string | null
}

export type TreeNode<T> = T & {
  children: TreeNode<T>[]
}

export type TreeFilterOptions<T> = {
  matches: (node: TreeNode<T>) => boolean
}

export function arrayToTree<T extends TreeArrayItem>(items: readonly T[]): TreeNode<T>[] {
  const childrenByParentId = new Map<string | null, TreeNode<T>[]>()
  const nodes = items.map<TreeNode<T>>((item) => ({
    ...item,
    children: [],
  }))

  for (const node of nodes) {
    const siblings = childrenByParentId.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParentId.set(node.parentId, siblings)
  }

  for (const node of nodes) {
    node.children = childrenByParentId.get(node.id) ?? []
  }

  return childrenByParentId.get(null) ?? []
}

export function treeToArray<T>(nodes: readonly TreeNode<T>[]): T[] {
  return nodes.flatMap((node) => {
    const { children, ...item } = node

    return [item as T, ...treeToArray(children)]
  })
}

export function filterTree<T>(
  nodes: readonly TreeNode<T>[],
  options: TreeFilterOptions<T>,
): TreeNode<T>[] {
  return nodes.flatMap((node) => {
    const filteredChildren = filterTree(node.children, options)

    if (!options.matches(node) && filteredChildren.length === 0) {
      return []
    }

    return [
      {
        ...node,
        children: filteredChildren,
      },
    ]
  })
}

export function getTreeNodeCount<T>(nodes: readonly TreeNode<T>[]): number {
  return nodes.reduce((total, node) => total + 1 + getTreeNodeCount(node.children), 0)
}
