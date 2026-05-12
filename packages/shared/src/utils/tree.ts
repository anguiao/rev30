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

export type TreeCheckedKey = string | number

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

export function isLeafInTree<T extends TreeArrayItem>(
  nodes: readonly TreeNode<T>[],
  nodeId: string,
): boolean {
  return nodes.some((node) => {
    if (node.id === nodeId) {
      return node.children.length === 0
    }

    return isLeafInTree(node.children, nodeId)
  })
}

type TreeSelectionIndex = {
  orderedIds: string[]
  parentIdsByNodeId: Map<string, string | null>
  descendantIdsByNodeId: Map<string, Set<string>>
}

function createTreeSelectionIndex<T extends TreeArrayItem>(
  nodes: readonly TreeNode<T>[],
): TreeSelectionIndex {
  const orderedIds: string[] = []
  const parentIdsByNodeId = new Map<string, string | null>()
  const descendantIdsByNodeId = new Map<string, Set<string>>()

  function visit(node: TreeNode<T>) {
    orderedIds.push(node.id)
    parentIdsByNodeId.set(node.id, node.parentId)

    const descendantIds = new Set<string>()
    for (const child of node.children) {
      visit(child)
      descendantIds.add(child.id)

      for (const childDescendantId of descendantIdsByNodeId.get(child.id) ?? []) {
        descendantIds.add(childDescendantId)
      }
    }

    descendantIdsByNodeId.set(node.id, descendantIds)
  }

  for (const node of nodes) {
    visit(node)
  }

  return {
    orderedIds,
    parentIdsByNodeId,
    descendantIdsByNodeId,
  }
}

function findAncestorNodeIds(
  nodeId: string,
  parentIdsByNodeId: ReadonlyMap<string, string | null>,
) {
  const ancestorIds: string[] = []
  let parentId = parentIdsByNodeId.get(nodeId)

  while (parentId !== undefined && parentId !== null) {
    ancestorIds.push(parentId)
    parentId = parentIdsByNodeId.get(parentId)
  }

  return ancestorIds
}

export function normalizeTreeCheckedKeys<T extends TreeArrayItem>(
  nodes: readonly TreeNode<T>[],
  checkedKeys: readonly TreeCheckedKey[],
  previousCheckedKeys: readonly TreeCheckedKey[],
): string[] {
  const { orderedIds, parentIdsByNodeId, descendantIdsByNodeId } = createTreeSelectionIndex(nodes)
  const selectedIds = new Set(checkedKeys.map(String))
  const previousIds = previousCheckedKeys.map(String)
  const previousIdSet = new Set(previousIds)
  const addedIds = [...selectedIds].filter((nodeId) => !previousIdSet.has(nodeId))
  const removedIds = previousIds.filter((nodeId) => !selectedIds.has(nodeId))

  for (const nodeId of addedIds) {
    for (const ancestorId of findAncestorNodeIds(nodeId, parentIdsByNodeId)) {
      selectedIds.add(ancestorId)
    }
  }

  for (const nodeId of removedIds) {
    selectedIds.delete(nodeId)

    for (const descendantId of descendantIdsByNodeId.get(nodeId) ?? []) {
      selectedIds.delete(descendantId)
    }
  }

  return orderedIds.filter((nodeId) => selectedIds.has(nodeId))
}
