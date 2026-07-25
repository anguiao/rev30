import type { Command, Range } from '@tiptap/core'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { normalizeLinkHref } from './href'
import { linkFeature } from './shared'

function updateLinkRange(range: Range, href?: string): Command {
  return ({ dispatch, tr }) => {
    const link = tr.doc.type.schema.marks.link

    if (!link) {
      return false
    }

    if (dispatch) {
      if (range.from === range.to) {
        if (href) {
          tr.addStoredMark(link.create({ href }))
        } else {
          tr.removeStoredMark(link)
        }
      } else if (href) {
        tr.addMark(range.from, range.to, link.create({ href }))
      } else {
        tr.removeMark(range.from, range.to, link)
      }
    }

    return true
  }
}

export const setLinkAction = defineRichTextAction(linkFeature, {
  key: 'set-link',
  command(href: string, range: Range) {
    const normalizedHref = normalizeLinkHref(href)

    return ({ chain }) =>
      normalizedHref ? chain().focus().command(updateLinkRange(range, normalizedHref)).run() : false
  },
})

export const unsetLinkAction = defineRichTextAction(linkFeature, {
  key: 'unset-link',
  command:
    (range: Range) =>
    ({ chain }) =>
      chain().focus().command(updateLinkRange(range)).run(),
})

export const linkEditorFeature = defineRichTextEditorFeature(linkFeature, {})
