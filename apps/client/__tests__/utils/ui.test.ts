// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { toSelectOptions, toTreeOptions } from '../../src/utils/ui'

type TestTreeNode = {
  id: string
  name: string
  code: string
  children: TestTreeNode[]
}

const departmentId = '44444444-4444-4444-8444-444444444444'
const secondDepartmentId = '55555555-5555-4555-8555-555555555555'

const tree: TestTreeNode[] = [
  {
    id: departmentId,
    name: '研发部',
    code: 'rd',
    children: [
      {
        id: secondDepartmentId,
        name: '前端组',
        code: 'frontend',
        children: [],
      },
    ],
  },
]

describe('toTreeOptions', () => {
  it('uses node name as the default label', () => {
    expect(toTreeOptions(tree)).toEqual([
      {
        key: departmentId,
        label: '研发部',
        disabled: false,
        children: [
          {
            key: secondDepartmentId,
            label: '前端组',
            disabled: false,
          },
        ],
      },
    ])
  })

  it('disables root and all descendants when disabledSubtreeRootId is root', () => {
    expect(
      toTreeOptions(tree, {
        label: (department) => `${department.name} (${department.code})`,
        disabledSubtreeRootId: departmentId,
      }),
    ).toEqual([
      {
        key: departmentId,
        label: '研发部 (rd)',
        disabled: true,
        children: [
          {
            key: secondDepartmentId,
            label: '前端组 (frontend)',
            disabled: true,
          },
        ],
      },
    ])
  })

  it('disables only the target subtree when disabledSubtreeRootId is a child node', () => {
    const siblingDepartmentId = '66666666-6666-4666-8666-666666666666'
    const thirdDepartmentId = '77777777-7777-4777-8777-777777777777'
    const nodes: TestTreeNode[] = [
      {
        ...tree[0]!,
        children: [
          {
            ...tree[0]!.children[0]!,
            children: [
              {
                id: thirdDepartmentId,
                name: '前端平台组',
                code: 'frontend-platform',
                children: [],
              },
            ],
          },
          {
            id: siblingDepartmentId,
            name: '后端组',
            code: 'backend',
            children: [],
          },
        ],
      },
    ]

    expect(
      toTreeOptions(nodes, {
        label: (department) => `${department.name} (${department.code})`,
        disabledSubtreeRootId: secondDepartmentId,
      }),
    ).toEqual([
      {
        key: departmentId,
        label: '研发部 (rd)',
        disabled: false,
        children: [
          {
            key: secondDepartmentId,
            label: '前端组 (frontend)',
            disabled: true,
            children: [
              {
                key: thirdDepartmentId,
                label: '前端平台组 (frontend-platform)',
                disabled: true,
              },
            ],
          },
          {
            key: siblingDepartmentId,
            label: '后端组 (backend)',
            disabled: false,
          },
        ],
      },
    ])
  })
})

describe('toSelectOptions', () => {
  it('uses id and name by default', () => {
    expect(
      toSelectOptions([
        { id: 'admin', name: '管理员' },
        { id: 'auditor', name: '审核员' },
      ]),
    ).toEqual([
      { label: '管理员', value: 'admin' },
      { label: '审核员', value: 'auditor' },
    ])
  })

  it('supports custom label and value mappers', () => {
    const teams = [
      { key: 'rd', title: '研发部' },
      { key: 'ops', title: '运营部' },
    ]

    expect(
      toSelectOptions(teams, {
        label: (team) => team.title,
        value: (team) => team.key,
      }),
    ).toEqual([
      { label: '研发部', value: 'rd' },
      { label: '运营部', value: 'ops' },
    ])
  })
})
