import type { ResourceTreeNode } from '@rev30/shared'

type BreadcrumbItem = {
  key: string
  name: string
  path: string | null
}

export type MenuMatch = {
  selectedKey: string
  parentKeys: string[]
  breadcrumbItems: BreadcrumbItem[]
}

export function findMenuMatch(menus: ResourceTreeNode[], currentPath: string): MenuMatch | null {
  let match: MenuMatch | null = null
  let matchedPathLength = -1

  visitMenus(menus, [], [])

  return match

  function visitMenus(
    currentMenus: ResourceTreeNode[],
    parentKeys: string[],
    breadcrumbItems: BreadcrumbItem[],
  ) {
    for (const menu of currentMenus) {
      const nextParentKeys = [...parentKeys, menu.id]
      const nextBreadcrumbItems = [
        ...breadcrumbItems,
        {
          key: menu.id,
          name: menu.name,
          path: menu.path,
        },
      ]

      if (menu.path !== null && matchesMenuPath(currentPath, menu.path)) {
        if (menu.path.length > matchedPathLength) {
          matchedPathLength = menu.path.length
          match = {
            selectedKey: menu.id,
            parentKeys,
            breadcrumbItems: nextBreadcrumbItems,
          }
        }
      }

      visitMenus(menu.children, nextParentKeys, nextBreadcrumbItems)
    }
  }
}

function matchesMenuPath(currentPath: string, menuPath: string) {
  return currentPath === menuPath || currentPath.startsWith(`${menuPath}/`)
}
