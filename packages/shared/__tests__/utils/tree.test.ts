import { describe, expect, it } from 'vitest'
import { arrayToTree, filterTree, getTreeNodeCount, treeToArray } from '../../src/utils'

type FlatNode = {
  id: string
  parentId: string | null
  name: string
  code: string
  status: 0 | 1
  type?: string
}

const items: FlatNode[] = [
  {
    id: 'root',
    parentId: null,
    name: '总部',
    code: 'hq',
    status: 1,
  },
  {
    id: 'engineering',
    parentId: 'root',
    name: '研发中心',
    code: 'eng',
    status: 1,
  },
  {
    id: 'platform',
    parentId: 'engineering',
    name: '平台组',
    code: 'platform',
    status: 0,
    type: 'menu',
  },
  {
    id: 'finance',
    parentId: 'root',
    name: '财务部',
    code: 'finance',
    status: 1,
    type: 'directory',
  },
]

const tree = arrayToTree(items)

describe('tree utils', () => {
  it('converts arrays to trees and preserves sibling order', () => {
    expect(tree).toEqual([
      {
        ...items[0],
        children: [
          {
            ...items[1],
            children: [
              {
                ...items[2],
                children: [],
              },
            ],
          },
          {
            ...items[3],
            children: [],
          },
        ],
      },
    ])
  })

  it('converts trees back to arrays without children fields', () => {
    expect(treeToArray(tree)).toEqual(items)
  })

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
    const matchesName = (node: FlatNode) => node.name.includes('部')
    const matchesType = (node: FlatNode) => node.type === 'menu'

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

    expect(getTreeNodeCount(filtered)).toBe(3)
  })
})
