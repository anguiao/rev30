import type { ResourceTreeNode } from '@rev30/shared'

export type AdminNavigationItem = {
  key: string
  name: string
  path: string | null
}

export type ActiveNavigation = {
  selectedKey: string
  parentKeys: string[]
  matchedPath: string
  breadcrumbItems: AdminNavigationItem[]
}

export function matchesMenuPath(currentPath: string, menuPath: string) {
  return currentPath === menuPath || currentPath.startsWith(`${menuPath}/`)
}

export function collectMenuKeys(resources: ResourceTreeNode[], keys = new Set<string>()) {
  for (const resource of resources) {
    keys.add(resource.id)
    collectMenuKeys(resource.children, keys)
  }

  return keys
}

export function findActiveNavigation(
  resources: ResourceTreeNode[],
  currentPath: string,
  parentKeys: string[] = [],
  breadcrumbItems: AdminNavigationItem[] = [],
): ActiveNavigation | null {
  let match: ActiveNavigation | null = null

  for (const resource of resources) {
    const nextParentKeys = [...parentKeys, resource.id]
    const nextBreadcrumbItems = [...breadcrumbItems, createNavigationItem(resource)]

    if (resource.path !== null && matchesMenuPath(currentPath, resource.path)) {
      if (match === null || resource.path.length > match.matchedPath.length) {
        match = {
          selectedKey: resource.id,
          parentKeys,
          matchedPath: resource.path,
          breadcrumbItems: nextBreadcrumbItems,
        }
      }
    }

    const childMatch = findActiveNavigation(
      resource.children,
      currentPath,
      nextParentKeys,
      nextBreadcrumbItems,
    )

    if (
      childMatch !== null &&
      (match === null || childMatch.matchedPath.length > match.matchedPath.length)
    ) {
      match = childMatch
    }
  }

  return match
}

function createNavigationItem(resource: ResourceTreeNode): AdminNavigationItem {
  return {
    key: resource.id,
    name: resource.name,
    path: resource.path,
  }
}
