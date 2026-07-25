import type { Editor, Range } from '@tiptap/core'
import type { Mark } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

export type RichTextLinkTargetSurface = 'quick-bar' | 'text-quick-bar' | 'toolbar'

export type RichTextLinkTargetMode = 'edit' | 'create' | 'set' | 'stored'

export interface RichTextLinkRange extends Range {
  readonly href: string
}

export interface RichTextLinkTarget {
  readonly mode: RichTextLinkTargetMode
  readonly range: Range
  readonly href: string
}

function getLinkHref(mark: Mark | undefined) {
  const href = mark?.attrs.href
  return typeof href === 'string' ? href : null
}

function collectLinkRanges(editor: Editor): RichTextLinkRange[] {
  const { selection, schema } = editor.state
  const { $from } = selection
  const linkType = schema.marks.link

  if (!linkType || !$from.parent.isTextblock) {
    return []
  }

  const parentStart = $from.start()
  const ranges: RichTextLinkRange[] = []

  $from.parent.forEach((node, offset) => {
    if (!node.isText) {
      return
    }

    const href = getLinkHref(node.marks.find((mark) => mark.type === linkType))
    if (!href) {
      return
    }

    const from = parentStart + offset
    const to = from + node.nodeSize
    const previous = ranges.at(-1)

    if (previous && previous.to === from && previous.href === href) {
      ranges[ranges.length - 1] = { ...previous, to }
      return
    }

    ranges.push({ from, to, href })
  })

  return ranges
}

function resolveCaretLinkRange(editor: Editor) {
  const { selection, storedMarks } = editor.state

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null
  }

  if (storedMarks !== null && !storedMarks.some((mark) => mark.type.name === 'link')) {
    return null
  }

  const candidates = collectLinkRanges(editor).filter(
    (range) => range.from <= selection.from && selection.from <= range.to,
  )

  return candidates.length === 1 ? candidates[0]! : null
}

function isPlainTextSelection(editor: Editor) {
  const { selection } = editor.state

  if (!(selection instanceof TextSelection) || selection.empty) {
    return false
  }

  const { $from, $to } = selection
  if ($from.parent !== $to.parent || !$from.parent.isTextblock) {
    return false
  }

  const parentStart = $from.start()
  let containsText = false
  let containsUnsupportedInlineContent = false

  $from.parent.nodesBetween(selection.from - parentStart, selection.to - parentStart, (node) => {
    if (node.isText) {
      containsText = true
      return
    }

    if (node.isInline) {
      containsUnsupportedInlineContent = true
    }
  })

  return containsText && !containsUnsupportedInlineContent
}

function createTarget(mode: RichTextLinkTargetMode, range: Range, href = ''): RichTextLinkTarget {
  return { mode, range, href }
}

function resolveTextSelectionTarget(editor: Editor) {
  const { selection } = editor.state

  if (!(selection instanceof TextSelection) || selection.empty || !isPlainTextSelection(editor)) {
    return null
  }

  const selectedRange = { from: selection.from, to: selection.to }
  const linkRanges = collectLinkRanges(editor)
  const containingRange = linkRanges.find(
    (range) => range.from <= selection.from && selection.to <= range.to,
  )

  if (containingRange) {
    return createTarget(
      'edit',
      { from: containingRange.from, to: containingRange.to },
      containingRange.href,
    )
  }

  const hasLinkMarks = linkRanges.some(
    (range) => range.from < selection.to && selection.from < range.to,
  )

  return createTarget(hasLinkMarks ? 'set' : 'create', selectedRange)
}

export function resolveRichTextLinkTarget(
  editor: Editor,
  surface: RichTextLinkTargetSurface,
): RichTextLinkTarget | null {
  const { selection } = editor.state
  const linkType = editor.schema.marks.link

  if (
    !(selection instanceof TextSelection) ||
    !linkType ||
    !selection.$from.parent.type.allowsMarkType(linkType)
  ) {
    return null
  }

  if (!selection.empty) {
    return surface === 'quick-bar' ? null : resolveTextSelectionTarget(editor)
  }

  const linkRange = resolveCaretLinkRange(editor)
  if (linkRange) {
    return createTarget('edit', { from: linkRange.from, to: linkRange.to }, linkRange.href)
  }

  if (surface !== 'toolbar' || !selection.$from.parent.isTextblock) {
    return null
  }

  return createTarget('stored', { from: selection.from, to: selection.to })
}
