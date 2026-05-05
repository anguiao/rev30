// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { filterTree, countTreeNodes } from '../../../src/features/system'

type TestNode = {
  id: string
  name: string
  code: string
  status: 0 | 1
  type?: string
  children: TestNode[]
}

const tree: TestNode[] = [
  {
    id: 'root',
    name: '总部',
    code: 'hq',
    status: 1,
    children: [
      {
        id: 'engineering',
        name: '研发中心',
        code: 'eng',
        status: 1,
        children: [
          {
            id: 'platform',
            name: '平台组',
            code: 'platform',
            status: 0,
            type: 'menu',
            children: [],
          },
        ],
      },
      {
        id: 'finance',
        name: '财务部',
        code: 'finance',
        status: 1,
        type: 'directory',
        children: [],
      },
    ],
  },
]

describe('filterTree', () => {
  it('keeps ancestors when a child node matches', () => {
    const rootNode = tree[0]!
    const engineeringNode = rootNode.children[0]!
    const platformNode = engineeringNode.children[0]!
    const filtered = filterTree(tree, {
      matches: (node) => node.name === '平台组',
    })

    expect(filtered).toEqual([
      {
        ...rootNode,
        children: [
          {
            ...engineeringNode,
            children: [platformNode],
          },
        ],
      },
    ])
  })

  it('filters by multiple predicates without mutating original tree', () => {
    const rootNode = tree[0]!
    const engineeringNode = rootNode.children[0]!
    const platformNode = engineeringNode.children[0]!
    const financeNode = rootNode.children[1]!
    const snapshot = JSON.parse(JSON.stringify(tree))
    const matchesName = (node: TestNode) => node.name.includes('部')
    const matchesType = (node: TestNode) => node.type === 'menu'

    const filtered = filterTree(tree, {
      matches: (node) => matchesName(node) || matchesType(node),
    })

    expect(filtered).toEqual([
      {
        ...rootNode,
        children: [
          {
            ...engineeringNode,
            children: [platformNode],
          },
          financeNode,
        ],
      },
    ])

    expect(tree).toEqual(snapshot)
  })

  it('counts all visible nodes in a filtered tree', () => {
    const filtered = filterTree(tree, {
      matches: (node) => node.name.includes('平台组'),
    })

    expect(countTreeNodes(filtered)).toBe(3)
  })
})
