import type { CommandProps } from '@tiptap/core'
import type { DOMOutputSpec, Mark, Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Selection } from '@tiptap/pm/state'
import { CellSelection, TableMap, type TableRole } from '@tiptap/pm/tables'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { elementPathFeature } from './shared'

export type ElementPathItem =
  | {
      readonly kind: 'node'
      readonly tag: string
      readonly key: string
      readonly node: ProseMirrorNode
      readonly from: number
    }
  | {
      readonly kind: 'mark'
      readonly tag: string
      readonly key: string
      readonly mark: Mark
      readonly from: number
      readonly to: number
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

function tagFromParseRule(ruleTag: unknown): string | null {
  if (typeof ruleTag !== 'string') {
    return null
  }

  const match = /^[a-z][a-z0-9-]*/i.exec(ruleTag.trim())
  return match?.[0]?.toLowerCase() ?? null
}

function parseTableRole(value: unknown): TableRole | null {
  return value === 'table' || value === 'row' || value === 'cell' || value === 'header_cell'
    ? value
    : null
}

function getNodeTag(node: ProseMirrorNode): string | null {
  const role = parseTableRole(node.type.spec.tableRole)

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

function appendNodeItem(items: ElementPathItem[], node: ProseMirrorNode, from: number) {
  const tag = getNodeTag(node)

  if (tag === null) {
    return
  }

  const to = from + node.nodeSize
  items.push({
    kind: 'node',
    tag,
    node,
    from,
    key: `node:${node.type.name}:${from}:${to}`,
  })
}

function createAncestorItems($pos: ResolvedPos): ElementPathItem[] {
  const items: ElementPathItem[] = []

  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    appendNodeItem(items, $pos.node(depth), $pos.before(depth))
  }

  return items
}

function collectMarkRanges(parent: ProseMirrorNode, parentStart: number, target: Mark) {
  const ranges: { from: number; to: number }[] = []

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

    const toDOM = mark.type.spec.toDOM
    const tag = toDOM ? tagFromOutputSpec(toDOM(mark, true)) : null

    if (tag !== null) {
      items.push({
        kind: 'mark',
        tag,
        mark,
        from: range.from,
        to: range.to,
        key: `mark:${mark.type.name}:${range.from}:${range.to}`,
      })
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
): boolean {
  if (node.isInline && node.isLeaf && node.type.spec.selectable === false) {
    return false
  }

  appendNodeItem(items, node, from)

  if (node.isText) {
    return true
  }

  let foundContent = false
  node.forEach((child, offset) => {
    if (foundContent) {
      return
    }

    const childFrom = from + 1 + offset

    if (child.isText) {
      if (node.isTextblock) {
        appendMarkItems(items, node, from + 1, childFrom, child.marks)
      }

      foundContent = true
      return
    }

    foundContent = appendFirstContentPath(items, child, childFrom)
  })

  return true
}

function resolveCellSelectionPath(selection: CellSelection) {
  const cells: { node: ProseMirrorNode; pos: number }[] = []
  selection.forEachCell((node, pos) => cells.push({ node, pos }))
  cells.sort((left, right) => left.pos - right.pos)
  const firstCell = cells[0]!

  const $cell = selection.$anchorCell.doc.resolve(firstCell.pos)
  const items: ElementPathItem[] = createAncestorItems($cell)
  appendNodeItem(items, firstCell.node, firstCell.pos)

  return items
}

/** Resolve the model-first element path for the current editor selection. */
export function resolveElementPath(state: EditorState): ElementPathItem[] {
  const { selection } = state

  if (selection instanceof AllSelection) {
    const items: ElementPathItem[] = []
    const firstChild = state.doc.firstChild

    if (firstChild !== null) {
      appendFirstContentPath(items, firstChild, 0)
    }

    return items
  }

  if (selection instanceof CellSelection) {
    return resolveCellSelectionPath(selection)
  }

  if (selection instanceof NodeSelection) {
    const items: ElementPathItem[] = createAncestorItems(selection.$from)
    appendNodeItem(items, selection.node, selection.from)
    return items
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

function collectTextRange(
  node: ProseMirrorNode,
  from: number,
): { from: number; to: number } | null {
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

function resolveCellSelectionForNode(doc: ProseMirrorNode, from: number, node: ProseMirrorNode) {
  const role = parseTableRole(node.type.spec.tableRole)

  if (role === null) {
    return null
  }

  if (role === 'cell' || role === 'header_cell') {
    return CellSelection.create(doc, from)
  }

  if (role === 'table') {
    const map = TableMap.get(node)
    const tableStart = from + 1
    return CellSelection.create(doc, tableStart + map.map[0]!, tableStart + map.map.at(-1)!)
  }

  const $row = doc.resolve(from)
  const table = $row.parent
  const tableStart = $row.start()
  const map = TableMap.get(table)
  const row = $row.index()

  return CellSelection.rowSelection(
    doc.resolve(tableStart + map.map[row * map.width]!),
    doc.resolve(tableStart + map.map[(row + 1) * map.width - 1]!),
  )
}

function resolveSelectionForItem(doc: ProseMirrorNode, item: ElementPathItem): Selection | null {
  if (item.kind === 'mark') {
    const $from = doc.resolve(item.from)

    if (!$from.parent.isTextblock) {
      return null
    }

    const range = collectMarkRanges($from.parent, $from.start(), item.mark).find(
      ({ from, to }) => from === item.from && to === item.to,
    )

    return range ? TextSelection.create(doc, range.from, range.to) : null
  }

  const node = doc.nodeAt(item.from)

  if (node === null || !node.eq(item.node)) {
    return null
  }

  const tableSelection = resolveCellSelectionForNode(doc, item.from, node)

  if (tableSelection !== null) {
    return tableSelection
  }

  const textRange = collectTextRange(node, item.from)

  if (textRange !== null) {
    return TextSelection.create(doc, textRange.from, textRange.to)
  }

  return NodeSelection.isSelectable(node) ? NodeSelection.create(doc, item.from) : null
}

export const selectElementPathItemAction = defineRichTextAction(elementPathFeature, {
  key: 'select-element-path-item',
  command: ({ editor, state, tr, dispatch }: CommandProps, item: ElementPathItem) => {
    if (!editor.isEditable) {
      return false
    }

    const selection = resolveSelectionForItem(state.doc, item)

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
