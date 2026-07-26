import type { Editor, Range } from '@tiptap/core'
import type { MarkType } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

export interface LinkRange extends Range {
  readonly href: string
}

function collectLinkRanges(selection: TextSelection, linkType: MarkType) {
  const { $from } = selection
  const parentStart = $from.start()
  const ranges: LinkRange[] = []

  $from.parent.forEach((node, offset) => {
    if (!node.isText) {
      return
    }

    const href = node.marks.find((mark) => mark.type === linkType)?.attrs.href
    if (typeof href !== 'string' || href === '') {
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

function containsOnlyText(selection: TextSelection) {
  const { $from, $to } = selection
  if ($from.parent !== $to.parent) {
    return false
  }

  const parentStart = $from.start()
  let onlyText = true

  $from.parent.nodesBetween(selection.from - parentStart, selection.to - parentStart, (node) => {
    if (node.isInline && !node.isText) {
      onlyText = false
    }
  })

  return onlyText
}

export function resolveLinkRange(editor: Editor): LinkRange | null {
  const { schema, selection, storedMarks } = editor.state
  const linkType = schema.marks.link

  if (
    !(selection instanceof TextSelection) ||
    !linkType ||
    !selection.$from.parent.isTextblock ||
    !selection.$from.parent.type.allowsMarkType(linkType)
  ) {
    return null
  }

  const selectionRange: LinkRange = {
    from: selection.from,
    to: selection.to,
    href: '',
  }

  if (selection.empty) {
    if (storedMarks !== null && !storedMarks.some((mark) => mark.type === linkType)) {
      return selectionRange
    }

    const linkRangesAtCaret = collectLinkRanges(selection, linkType).filter(
      (range) => range.from <= selection.from && selection.from <= range.to,
    )
    return linkRangesAtCaret.length === 1 ? linkRangesAtCaret[0]! : selectionRange
  }

  if (!containsOnlyText(selection)) {
    return null
  }

  return (
    collectLinkRanges(selection, linkType).find(
      (range) => range.from <= selection.from && selection.to <= range.to,
    ) ?? selectionRange
  )
}
