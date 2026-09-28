import type { ResourceTreeNode } from '@rev30/contracts'
import { describe, expect, it } from 'vitest'
import { filterSearchableMenus, findMenuMatch, getSearchableMenus } from '../../src/utils/menu'

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
        name: '系统用户',
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
            name: '系统角色',
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
      selectedMenu: {
        key: 'users',
        name: '系统用户',
        path: '/system/users',
      },
      parentKeys: ['system'],
      breadcrumbItems: [
        { key: 'system', name: '系统管理', path: null },
        { key: 'users', name: '系统用户', path: '/system/users' },
      ],
    })
  })

  it('returns all parent keys for deeply nested menu items', () => {
    const match = findMenuMatch(menus, '/system/roles')

    expect(match?.selectedMenu.key).toBe('roles')
    expect(match?.parentKeys).toEqual(['system', 'docs'])
    expect(match?.breadcrumbItems.map((item) => item.name)).toEqual([
      '系统管理',
      '指南',
      '系统角色',
    ])
  })

  it('matches dynamic route paths as the most specific menu item', () => {
    const dynamicMenus: ResourceTreeNode[] = [
      createMenu({
        id: 'system',
        type: 'directory',
        name: '系统管理',
        children: [
          createMenu({
            id: 'users',
            parentId: 'system',
            name: '系统用户',
            path: '/system/users',
            children: [
              createMenu({
                id: 'user-detail',
                parentId: 'users',
                name: '用户详情',
                path: '/system/users/:id',
                hidden: true,
              }),
            ],
          }),
        ],
      }),
    ]

    const match = findMenuMatch(dynamicMenus, '/system/users/123')

    expect(match).toEqual({
      selectedMenu: {
        key: 'user-detail',
        name: '用户详情',
        path: '/system/users/:id',
      },
      parentKeys: ['system', 'users'],
      breadcrumbItems: [
        { key: 'system', name: '系统管理', path: null },
        { key: 'users', name: '系统用户', path: '/system/users' },
        { key: 'user-detail', name: '用户详情', path: '/system/users/:id' },
      ],
    })
  })

  it('prefers static path matches over dynamic matches with the same segment count', () => {
    const staticAndDynamicMenus: ResourceTreeNode[] = [
      createMenu({
        id: 'resources',
        type: 'directory',
        name: '资源',
        children: [
          createMenu({
            id: 'resource-detail',
            parentId: 'resources',
            name: '资源详情',
            path: '/system/resources/:resourceId',
            hidden: true,
          }),
          createMenu({
            id: 'resource-create',
            parentId: 'resources',
            name: '新建资源',
            path: '/system/resources/new',
            hidden: true,
          }),
        ],
      }),
    ]

    const match = findMenuMatch(staticAndDynamicMenus, '/system/resources/new')

    expect(match?.selectedMenu).toEqual({
      key: 'resource-create',
      name: '新建资源',
      path: '/system/resources/new',
    })
  })

  it('ignores external menus and unknown routes', () => {
    expect(findMenuMatch(menus, 'https://example.com/docs')).toBeNull()
    expect(findMenuMatch(menus, '/unknown')).toBeNull()
    expect(findMenuMatch(menus, '/system/usersettings')).toBeNull()
  })
})

describe('menu search helpers', () => {
  it('keeps navigable parents and descendants in depth-first order with their ancestors', () => {
    const navigableParent = createMenu({
      id: 'parent',
      name: 'Parent',
      path: '/parent',
      children: [createMenu({ id: 'child', name: 'Child', path: '/child' })],
    })

    expect(
      getSearchableMenus([...menus, navigableParent]).map(({ menu, parentNames }) => ({
        id: menu.id,
        parentNames,
      })),
    ).toEqual([
      { id: 'users', parentNames: ['系统管理'] },
      { id: 'roles', parentNames: ['系统管理', '指南'] },
      { id: 'external-docs', parentNames: ['系统管理'] },
      { id: 'parent', parentNames: [] },
      { id: 'child', parentNames: ['Parent'] },
    ])
    expect(getSearchableMenus([navigableParent])[0]?.menu).toBe(navigableParent)
  })

  it('matches only menu names after trimming and ignoring English case', () => {
    const sameNames = getSearchableMenus([
      createMenu({
        id: 'operations',
        name: '运维管理',
        children: [
          createMenu({ id: 'login-log', name: '登录日志', path: '/login-log' }),
          createMenu({ id: 'operation-log', name: '操作日志', path: '/operation-log' }),
        ],
      }),
      createMenu({ id: 'guide', name: 'Guide', externalUrl: 'https://example.com' }),
    ])

    expect(filterSearchableMenus(sameNames, ' 日志 ').map(({ menu }) => menu.id)).toEqual([
      'login-log',
      'operation-log',
    ])
    expect(filterSearchableMenus(sameNames, '运维')).toEqual([])
    expect(filterSearchableMenus(sameNames, 'guide').map(({ menu }) => menu.id)).toEqual(['guide'])
    expect(filterSearchableMenus(sameNames, 'GUIDE').map(({ menu }) => menu.id)).toEqual(['guide'])
    expect(filterSearchableMenus(sameNames, '/login-log')).toEqual([])
    expect(filterSearchableMenus(sameNames, '')).toEqual(sameNames)
    expect(filterSearchableMenus(sameNames, '   ')).toEqual(sameNames)
  })
})
