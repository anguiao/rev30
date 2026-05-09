import type { ResourceTreeNode } from '@rev30/shared'
import { describe, expect, it } from 'vitest'
import { findMenuMatch } from '../../../../src/components/admin/navigation/menu'

function createMenu(
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

const menus: ResourceTreeNode[] = [
  createMenu({
    id: 'system',
    type: 'directory',
    name: '系统管理',
    children: [
      createMenu({
        id: 'users',
        parentId: 'system',
        name: '用户管理',
        path: '/system/users',
      }),
      createMenu({
        id: 'docs',
        parentId: 'system',
        type: 'directory',
        name: '指南',
        children: [
          createMenu({
            id: 'roles',
            parentId: 'docs',
            name: '角色管理',
            path: '/system/roles',
          }),
        ],
      }),
      createMenu({
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

describe('admin menu helpers', () => {
  it('selects the most specific internal route and returns breadcrumb items', () => {
    const match = findMenuMatch(menus, '/system/users/123')

    expect(match).toEqual({
      selectedKey: 'users',
      parentKeys: ['system'],
      breadcrumbItems: [
        { key: 'system', name: '系统管理', path: null },
        { key: 'users', name: '用户管理', path: '/system/users' },
      ],
    })
  })

  it('returns all parent keys for deeply nested menu items', () => {
    const match = findMenuMatch(menus, '/system/roles')

    expect(match?.selectedKey).toBe('roles')
    expect(match?.parentKeys).toEqual(['system', 'docs'])
    expect(match?.breadcrumbItems.map((item) => item.name)).toEqual([
      '系统管理',
      '指南',
      '角色管理',
    ])
  })

  it('ignores external menus and unknown routes', () => {
    expect(findMenuMatch(menus, 'https://example.com/docs')).toBeNull()
    expect(findMenuMatch(menus, '/unknown')).toBeNull()
    expect(findMenuMatch(menus, '/system/usersettings')).toBeNull()
  })
})
