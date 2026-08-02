import type { CommandProps } from '@tiptap/core'
import type {
  DOMOutputSpec,
  Mark,
  MarkType,
  Node as ProseMirrorNode,
  NodeType,
  ResolvedPos,
} from '@tiptap/pm/model'
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Selection } from '@tiptap/pm/state'
import { CellSelection, TableMap, type TableRole } from '@tiptap/pm/tables'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { elementPathFeature } from './shared'

interface ElementPathItemBase {
  readonly tag: string
  readonly from: number
  readonly to: number
  readonly key: string
}

export interface ElementPathNodeItem extends ElementPathItemBase {
  readonly kind: 'node'
  readonly node: ProseMirrorNode
  readonly nodeType: NodeType
  readonly depth: number
}

export interface ElementPathMarkItem extends ElementPathItemBase {
  readonly kind: 'mark'
  readonly mark: Mark
  readonly markType: MarkType
}

export type ElementPathItem = ElementPathNodeItem | ElementPathMarkItem

interface TextRange {
  readonly from: number
  readonly to: number
}

interface CellPosition {
  readonly node: ProseMirrorNode
  readonly pos: number
}

function tagFromOutputSpec(output: DOMOutputSpec): string | null {
  if (Array.isArray(output)) {
    const tag = output[0]
    return typeof tag === 'string' ? tagFromOutputTagName(tag) : null
  }

  if (output && typeof output === 'object') {
    if ('dom' in output) {
      return tagFromDOMNode(output.dom)
    }

    return tagFromDOMNode(output)
  }

  return null
}

function tagFromOutputTagName(value: string): string | null {
  const tag = value.trim()
  const namespaceSeparator = tag.lastIndexOf(' ')
  const semanticTag = namespaceSeparator > 0 ? tag.slice(namespaceSeparator + 1).trim() : tag

  return semanticTag === '' ? null : semanticTag.toLowerCase()
}

function tagFromDOMNode(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const tagName = (value as { readonly tagName?: unknown }).tagName
  return typeof tagName === 'string' && tagName !== '' ? tagName.toLowerCase() : null
}

function tagFromParseRule(ruleTag: unknown): string | null {
  if (typeof ruleTag !== 'string') {
    return null
  }

  const match = /^[a-z][a-z0-9-]*/i.exec(ruleTag.trim())
  return match?.[0]?.toLowerCase() ?? null
}

function getTableRole(nodeType: NodeType): TableRole | null {
  const role = nodeType.spec.tableRole
  return role === 'table' || role === 'row' || role === 'cell' || role === 'header_cell'
    ? role
    : null
}

function getNodeTag(node: ProseMirrorNode): string | null {
  const role = getTableRole(node.type)

  if (role !== null) {
    for (const rule of node.type.spec.parseDOM ?? []) {
      const tag = tagFromParseRule(rule.tag)

      if (tag !== null) {
        return tag
      }
    }

    return null
  }

  const toDOM = node.type.spec.toDOM
  return toDOM ? tagFromOutputSpec(toDOM(node)) : null
}

function getMarkTag(mark: Mark): string | null {
  const toDOM = mark.type.spec.toDOM
  return toDOM ? tagFromOutputSpec(toDOM(mark, true)) : null
}

function createNodeItem(
  node: ProseMirrorNode,
  from: number,
  to: number,
  depth: number,
): ElementPathNodeItem | null {
  const tag = getNodeTag(node)

  if (tag === null) {
    return null
  }

  return {
    kind: 'node',
    tag,
    node,
    nodeType: node.type,
    from,
    to,
    depth,
    key: `node:${node.type.name}:${from}:${to}`,
  }
}

function createMarkItem(mark: Mark, from: number, to: number): ElementPathMarkItem | null {
  const tag = getMarkTag(mark)

  if (tag === null) {
    return null
  }

  return {
    kind: 'mark',
    tag,
    mark,
    markType: mark.type,
    from,
    to,
    key: `mark:${mark.type.name}:${from}:${to}`,
  }
}

function createAncestorItems($pos: ResolvedPos): ElementPathNodeItem[] {
  const items: ElementPathNodeItem[] = []

  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth)
    const item = createNodeItem(node, $pos.before(depth), $pos.after(depth), depth)

    if (item !== null) {
      items.push(item)
    }
  }

  return items
}

function collectMarkRanges(parent: ProseMirrorNode, parentStart: number, target: Mark) {
  const ranges: TextRange[] = []

  parent.forEach((node, offset) => {
    if (!node.isText || !node.marks.some((mark) => mark.eq(target))) {
      return
    }

    const from = parentStart + offset
    const to = from + node.nodeSize
    const previous = ranges.at(-1)

    if (previous?.to === from) {
      ranges[ranges.length - 1] = { from: previous.from, to }
      return
    }

    ranges.push({ from, to })
  })

  return ranges
}

function appendMarkItems(
  items: ElementPathItem[],
  parent: ProseMirrorNode,
  parentStart: number,
  point: number,
  marks: readonly Mark[],
) {
  for (const mark of marks) {
    const range = collectMarkRanges(parent, parentStart, mark).find(
      ({ from, to }) => from <= point && point <= to,
    )

    if (!range) {
      continue
    }

    const item = createMarkItem(mark, range.from, range.to)

    if (item !== null) {
      items.push(item)
    }
  }
}

function appendTextSelectionMarks(items: ElementPathItem[], state: EditorState) {
  const { selection } = state
  const $from = selection.$from

  if (!$from.parent.isTextblock) {
    return
  }

  const marks = selection.empty
    ? $from.marks()
    : $from.nodeAfter?.isText
      ? $from.nodeAfter.marks
      : []

  appendMarkItems(items, $from.parent, $from.start(), selection.from, marks)
}

function appendFirstContentPath(
  items: ElementPathItem[],
  node: ProseMirrorNode,
  from: number,
  depth: number,
): boolean {
  const nodeItem = createNodeItem(node, from, from + node.nodeSize, depth)

  if (nodeItem !== null) {
    items.push(nodeItem)
  }

  if (node.isText) {
    return true
  }

  if (node.isInline && node.isLeaf) {
    return node.type.spec.selectable !== false
  }

  if (node.isTextblock) {
    let foundContent = false
    node.forEach((child, offset) => {
      if (foundContent) {
        return
      }

      const childFrom = from + 1 + offset

      if (child.isText) {
        appendMarkItems(items, node, from + 1, childFrom, child.marks)
        foundContent = true
        return
      }

      if (child.isInline && child.isLeaf && child.type.spec.selectable === false) {
        return
      }

      foundContent = appendFirstContentPath(items, child, childFrom, depth + 1)
    })

    return true
  }

  let foundContent = false
  node.forEach((child, offset) => {
    if (foundContent) {
      return
    }

    foundContent = appendFirstContentPath(items, child, from + 1 + offset, depth + 1)
  })

  return true
}

function resolveAllSelectionPath(state: EditorState) {
  const items: ElementPathItem[] = []
  const firstChild = state.doc.firstChild

  if (firstChild !== null) {
    appendFirstContentPath(items, firstChild, 0, 1)
  }

  return items
}

function resolveCellSelectionPath(selection: CellSelection) {
  const cells: CellPosition[] = []
  selection.forEachCell((node, pos) => cells.push({ node, pos }))
  cells.sort((left, right) => left.pos - right.pos)
  const firstCell = cells[0]

  if (firstCell === undefined) {
    return []
  }

  const $cell = selection.$anchorCell.doc.resolve(firstCell.pos)
  const items: ElementPathItem[] = createAncestorItems($cell)
  const cell = $cell.nodeAfter
  const cellRole = cell ? getTableRole(cell.type) : null

  if (cell === null || (cellRole !== 'cell' && cellRole !== 'header_cell')) {
    return items
  }

  const item = createNodeItem(cell, $cell.pos, $cell.pos + cell.nodeSize, $cell.depth + 1)

  if (item !== null) {
    items.push(item)
  }

  return items
}

function resolveNodeSelectionPath(selection: NodeSelection) {
  const items: ElementPathItem[] = createAncestorItems(selection.$from)
  const item = createNodeItem(
    selection.node,
    selection.from,
    selection.to,
    selection.$from.depth + 1,
  )

  if (item !== null) {
    items.push(item)
  }

  return items
}

/** Resolve the model-first element path for the current editor selection. */
export function resolveElementPath(state: EditorState): ElementPathItem[] {
  const { selection } = state

  if (selection instanceof AllSelection) {
    return resolveAllSelectionPath(state)
  }

  if (selection instanceof CellSelection) {
    return resolveCellSelectionPath(selection)
  }

  if (selection instanceof NodeSelection) {
    return resolveNodeSelectionPath(selection)
  }

  if (selection instanceof GapCursor) {
    return createAncestorItems(selection.$from)
  }

  const items: ElementPathItem[] = createAncestorItems(selection.$from)

  if (selection instanceof TextSelection) {
    appendTextSelectionMarks(items, state)
  }

  return items
}

function collectTextRange(node: ProseMirrorNode, from: number): TextRange | null {
  if (node.isTextblock) {
    return { from: from + 1, to: from + node.nodeSize - 1 }
  }

  if (node.isLeaf || node.type.spec.atom) {
    return null
  }

  let first: number | null = null
  let last: number | null = null

  node.forEach((child, offset) => {
    const range = collectTextRange(child, from + 1 + offset)

    if (range === null) {
      return
    }

    first ??= range.from
    last = range.to
  })

  return first === null || last === null ? null : { from: first, to: last }
}

function resolveNodeAtItem(state: Pick<EditorState, 'doc'>, item: ElementPathNodeItem) {
  const node = state.doc.nodeAt(item.from)
  return node && node.eq(item.node) && node.type === item.nodeType ? node : null
}

function resolveCellSelectionForNode(
  state: Pick<EditorState, 'doc'>,
  item: ElementPathNodeItem,
  node: ProseMirrorNode,
) {
  const role = getTableRole(node.type)

  if (role === null) {
    return null
  }

  if (role === 'cell' || role === 'header_cell') {
    return CellSelection.create(state.doc, item.from)
  }

  if (role === 'table') {
    const map = TableMap.get(node)
    const tableStart = item.from + 1
    const firstCell = map.map[0]
    const lastCell = map.map.at(-1)

    if (firstCell === undefined || lastCell === undefined) {
      return null
    }

    return CellSelection.create(state.doc, tableStart + firstCell, tableStart + lastCell)
  }

  const $insideRow = state.doc.resolve(item.from + 1)
  let tableDepth = $insideRow.depth

  while (tableDepth > 0 && getTableRole($insideRow.node(tableDepth).type) !== 'table') {
    tableDepth -= 1
  }

  if (getTableRole($insideRow.node(tableDepth).type) !== 'table') {
    return null
  }

  const table = $insideRow.node(tableDepth)
  const tableStart = $insideRow.start(tableDepth)
  const map = TableMap.get(table)
  const row = $insideRow.index(tableDepth)

  if (row < 0 || row >= map.height) {
    return null
  }

  const firstCell = map.map[row * map.width]
  const lastCell = map.map[(row + 1) * map.width - 1]

  if (firstCell === undefined || lastCell === undefined) {
    return null
  }

  return CellSelection.rowSelection(
    state.doc.resolve(tableStart + firstCell),
    state.doc.resolve(tableStart + lastCell),
  )
}

function resolveSelectionForNode(
  state: Pick<EditorState, 'doc'>,
  item: ElementPathNodeItem,
): Selection | null {
  const node = resolveNodeAtItem(state, item)

  if (node === null) {
    return null
  }

  const tableSelection = resolveCellSelectionForNode(state, item, node)

  if (tableSelection !== null) {
    return tableSelection
  }

  const textRange = collectTextRange(node, item.from)

  if (textRange !== null) {
    return TextSelection.create(state.doc, textRange.from, textRange.to)
  }

  return NodeSelection.isSelectable(node) ? NodeSelection.create(state.doc, item.from) : null
}

function resolveSelectionForMark(
  state: Pick<EditorState, 'doc'>,
  item: ElementPathMarkItem,
): Selection | null {
  const $from = state.doc.resolve(item.from)

  if (!$from.parent.isTextblock) {
    return null
  }

  const range = collectMarkRanges($from.parent, $from.start(), item.mark).find(
    ({ from, to }) => from === item.from && to === item.to,
  )

  return range ? TextSelection.create(state.doc, range.from, range.to) : null
}

function resolveSelectionForItem(
  state: Pick<EditorState, 'doc'>,
  item: ElementPathItem,
): Selection | null {
  return item.kind === 'node'
    ? resolveSelectionForNode(state, item)
    : resolveSelectionForMark(state, item)
}

export const selectElementPathItemAction = defineRichTextAction(elementPathFeature, {
  key: 'select-element-path-item',
  command: ({ editor, state, tr, dispatch }: CommandProps, item: ElementPathItem) => {
    if (!editor.isEditable) {
      return false
    }

    const selection = resolveSelectionForItem(state, item)

    if (selection === null) {
      return false
    }

    tr.setSelection(selection).setMeta('addToHistory', false).scrollIntoView()

    if (dispatch) {
      dispatch(tr)
      editor.view.focus()
    }

    return true
  },
})

export const elementPathEditorFeature = defineRichTextEditorFeature(elementPathFeature, {})
