import type { Command, Range } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { find } from 'linkifyjs'
import { defineRichTextAction } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import type { RichTextPasteRule } from '../../../client/editor/paste'
import { defaultLinkProtocol, normalizeLinkHref } from '../core/href'
import { linkFeature } from '../core/feature'

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
  command({ chain }, href: string, range: Range) {
    const normalizedHref = normalizeLinkHref(href)

    return normalizedHref
      ? chain().focus().command(setLinkMark(range, normalizedHref)).run()
      : false
  },
})

export const unsetLinkAction = defineRichTextAction(linkFeature, {
  key: 'unset-link',
  command: ({ chain }, range: Range) => chain().focus().command(setLinkMark(range, null)).run(),
})

function getPastedLinkHref(event: ClipboardEvent) {
  const clipboardData = event.clipboardData

  if (
    clipboardData === null ||
    clipboardData.files.length > 0 ||
    clipboardData.getData('text/html') !== ''
  ) {
    return null
  }

  const text = clipboardData.getData('text/plain').trim()
  const [token] = find(text, { defaultProtocol: defaultLinkProtocol })

  if (!token?.isLink || token.value !== text || (token.type !== 'url' && token.type !== 'email')) {
    return null
  }

  const href = normalizeLinkHref(token.href)

  return href === '' ? null : href
}

export const linkPasteRule: RichTextPasteRule = {
  handlePaste({ editor, event }) {
    const href = getPastedLinkHref(event)
    if (href === null) {
      return false
    }

    const { schema, selection } = editor.state
    const link = schema.marks.link

    if (
      !(selection instanceof TextSelection) ||
      selection.empty ||
      !link ||
      selection.$from.parent !== selection.$to.parent ||
      !selection.$from.parent.isTextblock ||
      !selection.$from.parent.type.allowsMarkType(link)
    ) {
      return false
    }

    editor.view.dispatch(
      editor.state.tr.addMark(selection.from, selection.to, link.create({ href })),
    )

    return true
  },
}

export const linkEditorFeature = defineRichTextEditorFeature(linkFeature, {
  pasteRule: linkPasteRule,
})
