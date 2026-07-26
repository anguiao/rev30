import type { Command, Range } from '@tiptap/core'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { normalizeLinkHref } from './href'
import { linkFeature } from './shared'

function setLinkMark(range: Range, href: string | null): Command {
  return ({ dispatch, state, tr }) => {
    const link = state.schema.marks.link

    if (!link) {
      return false
    }

    if (!dispatch) {
      return true
    }

    if (range.from === range.to) {
      if (href !== null) {
        tr.addStoredMark(link.create({ href }))
      } else {
        tr.removeStoredMark(link)
      }
    } else if (href !== null) {
      tr.addMark(range.from, range.to, link.create({ href }))
    } else {
      tr.removeMark(range.from, range.to, link)
    }

    return true
  }
}

export const setLinkAction = defineRichTextAction(linkFeature, {
  key: 'set-link',
  command(href: string, range: Range) {
    const normalizedHref = normalizeLinkHref(href)

    return ({ chain }) =>
      normalizedHref ? chain().focus().command(setLinkMark(range, normalizedHref)).run() : false
  },
})

export const unsetLinkAction = defineRichTextAction(linkFeature, {
  key: 'unset-link',
  command:
    (range: Range) =>
    ({ chain }) =>
      chain().focus().command(setLinkMark(range, null)).run(),
})

export const linkEditorFeature = defineRichTextEditorFeature(linkFeature, {})
