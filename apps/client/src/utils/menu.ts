import type { ResourceTreeNode } from '@rev30/contracts'

type MenuMatchItem = {
  key: string
  name: string
  path: string | null
}

type MenuPathMatchScore = {
  segmentCount: number
  staticSegmentCount: number
  dynamicSegmentCount: number
}

export type MenuMatch = {
  selectedMenu: MenuMatchItem
  parentKeys: string[]
  breadcrumbItems: MenuMatchItem[]
}

export function findMenuMatch(menus: ResourceTreeNode[], currentPath: string): MenuMatch | null {
  let match: MenuMatch | null = null
  let matchedScore: MenuPathMatchScore | null = null

  visitMenus(menus, [], [])

  return match

  function visitMenus(
    currentMenus: ResourceTreeNode[],
    parentKeys: string[],
    breadcrumbItems: MenuMatchItem[],
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

      if (menu.path !== null) {
        const score = getMenuPathMatchScore(currentPath, menu.path)

        if (score !== null && isBetterMenuPathMatch(score, matchedScore)) {
          matchedScore = score
          match = {
            selectedMenu: {
              key: menu.id,
              name: menu.name,
              path: menu.path,
            },
            parentKeys,
            breadcrumbItems: nextBreadcrumbItems,
          }
        }
      }

      visitMenus(menu.children, nextParentKeys, nextBreadcrumbItems)
    }
  }
}

function getMenuPathMatchScore(currentPath: string, menuPath: string): MenuPathMatchScore | null {
  if (menuPath.includes(':')) {
    return getDynamicMenuPathMatchScore(currentPath, menuPath)
  }

  if (currentPath !== menuPath && !currentPath.startsWith(`${menuPath}/`)) {
    return null
  }

  const segmentCount = splitPathSegments(menuPath).length

  return {
    segmentCount,
    staticSegmentCount: segmentCount,
    dynamicSegmentCount: 0,
  }
}

function getDynamicMenuPathMatchScore(
  currentPath: string,
  menuPath: string,
): MenuPathMatchScore | null {
  const currentSegments = splitPathSegments(currentPath)
  const menuSegments = splitPathSegments(menuPath)

  if (currentSegments.length !== menuSegments.length) {
    return null
  }

  let dynamicSegmentCount = 0

  for (const [index, segment] of menuSegments.entries()) {
    const currentSegment = currentSegments[index]

    if (segment.startsWith(':')) {
      dynamicSegmentCount += 1
    } else if (segment !== currentSegment) {
      return null
    }
  }

  return {
    segmentCount: menuSegments.length,
    staticSegmentCount: menuSegments.length - dynamicSegmentCount,
    dynamicSegmentCount,
  }
}

function splitPathSegments(path: string) {
  return path.split('/').filter(Boolean)
}

function isBetterMenuPathMatch(score: MenuPathMatchScore, matchedScore: MenuPathMatchScore | null) {
  if (matchedScore === null) {
    return true
  }

  if (score.segmentCount !== matchedScore.segmentCount) {
    return score.segmentCount > matchedScore.segmentCount
  }

  if (score.staticSegmentCount !== matchedScore.staticSegmentCount) {
    return score.staticSegmentCount > matchedScore.staticSegmentCount
  }

  return score.dynamicSegmentCount < matchedScore.dynamicSegmentCount
}
