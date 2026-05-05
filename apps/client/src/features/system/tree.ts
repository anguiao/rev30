export type TreeNodeWithChildren<TNode> = TNode & {
  children: TreeNodeWithChildren<TNode>[]
}

export type TreeFilterOptions<TNode> = {
  matches: (node: TreeNodeWithChildren<TNode>) => boolean
}

export function filterTree<TNode>(
  nodes: TreeNodeWithChildren<TNode>[],
  options: TreeFilterOptions<TNode>,
): TreeNodeWithChildren<TNode>[] {
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

export function countTreeNodes<TNode>(nodes: TreeNodeWithChildren<TNode>[]) {
  return nodes.reduce((total, node) => total + 1 + countTreeNodes(node.children), 0)
}
