import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'
import { linkDefaultProtocol, normalizeLinkHref } from './href'

const ValidatedLink = Link.extend({
  addKeyboardShortcuts() {
    return {
      ArrowRight: () => {
        const { selection, storedMarks, tr } = this.editor.state
        const { $from } = selection

        if (!selection.empty || !$from.parent.isTextblock || $from.pos !== $from.end()) {
          return false
        }

        const link = (storedMarks ?? $from.marks()).find((mark) => mark.type.name === this.name)
        if (!link) {
          return false
        }

        this.editor.view.dispatch(tr.removeStoredMark(link))
        return true
      },
    }
  },

  addAttributes() {
    return {
      href: {
        isRequired: true,
        parseHTML: (element) => element.getAttribute('href'),
        validate: (value) => {
          if (
            typeof value !== 'string' ||
            value !== value.trim() ||
            normalizeLinkHref(value) === ''
          ) {
            throw new RangeError('Invalid link href')
          }
        },
      },
    }
  },
})

export const linkFeature = defineRichTextFeature({
  key: 'link',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [
    ValidatedLink.configure({
      openOnClick: false,
      enableClickSelection: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: linkDefaultProtocol,
      isAllowedUri: (url, ctx) => {
        const normalizedHref = normalizeLinkHref(url, ctx.defaultProtocol)

        return normalizedHref !== '' && ctx.defaultValidate(normalizedHref)
      },
      shouldAutoLink: (url) => normalizeLinkHref(url) !== '',
    }),
  ],
})
