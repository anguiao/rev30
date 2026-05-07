import type { ResourceTreeNode } from '@rev30/shared'
import { describe, expect, it } from 'vitest'
import {
  collectMenuKeys,
  findActiveNavigation,
  matchesMenuPath,
} from '../../../../src/components/admin/navigation/adminNavigation'

function createResource(
  overrides: Partial<ResourceTreeNode> & Pick<ResourceTreeNode, 'id' | 'name'>,
): ResourceTreeNode {
  const { id, name, ...rest } = overrides

  return {
    id,
    parentId: null,
    type: 'menu',
    name,
    code: id,
    path: null,
    externalUrl: null,
    openTarget: 'self',
    icon: null,
    hidden: false,
    status: 1,
    sortOrder: 0,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [],
    ...rest,
  }
}

const resources: ResourceTreeNode[] = [
  createResource({
    id: 'system',
    type: 'directory',
    name: '系统管理',
    children: [
      createResource({
        id: 'users',
        parentId: 'system',
        name: '用户管理',
        path: '/system/users',
      }),
      createResource({
        id: 'docs',
        parentId: 'system',
        type: 'directory',
        name: '指南',
        children: [
          createResource({
            id: 'roles',
            parentId: 'docs',
            name: '角色管理',
            path: '/system/roles',
          }),
        ],
      }),
      createResource({
        id: 'external-docs',
        parentId: 'system',
        type: 'external',
        name: '开发文档',
        externalUrl: 'https://example.com/docs',
        openTarget: 'blank',
      }),
    ],
  }),
]

describe('admin navigation helpers', () => {
  it('matches menu paths and nested route paths', () => {
    expect(matchesMenuPath('/system/users', '/system/users')).toBe(true)
    expect(matchesMenuPath('/system/users/123', '/system/users')).toBe(true)
    expect(matchesMenuPath('/system/usersettings', '/system/users')).toBe(false)
  })

  it('collects every menu key in the resource tree', () => {
    expect([...collectMenuKeys(resources)]).toEqual([
      'system',
      'users',
      'docs',
      'roles',
      'external-docs',
    ])
  })

  it('selects the most specific internal route and returns breadcrumb items', () => {
    const match = findActiveNavigation(resources, '/system/users/123')

    expect(match).toEqual({
      selectedKey: 'users',
      parentKeys: ['system'],
      matchedPath: '/system/users',
      breadcrumbItems: [
        { key: 'system', name: '系统管理', path: null },
        { key: 'users', name: '用户管理', path: '/system/users' },
      ],
    })
  })

  it('returns all parent keys for deeply nested menu items', () => {
    const match = findActiveNavigation(resources, '/system/roles')

    expect(match?.selectedKey).toBe('roles')
    expect(match?.parentKeys).toEqual(['system', 'docs'])
    expect(match?.breadcrumbItems.map((item) => item.name)).toEqual([
      '系统管理',
      '指南',
      '角色管理',
    ])
  })

  it('ignores external resources and unknown routes', () => {
    expect(findActiveNavigation(resources, 'https://example.com/docs')).toBeNull()
    expect(findActiveNavigation(resources, '/unknown')).toBeNull()
  })
})
