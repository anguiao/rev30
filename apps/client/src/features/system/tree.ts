export type TreeNode<T> = T & {
  children: TreeNode<T>[]
}

export type TreeFilterOptions<T> = {
  matches: (node: TreeNode<T>) => boolean
}

export function filterTree<T>(nodes: TreeNode<T>[], options: TreeFilterOptions<T>): TreeNode<T>[] {
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

export function countTreeNodes<T>(nodes: TreeNode<T>[]): number {
  return nodes.reduce((total, node) => total + 1 + countTreeNodes(node.children), 0)
}
