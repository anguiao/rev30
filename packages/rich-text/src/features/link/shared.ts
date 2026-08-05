import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'
import { linkDefaultProtocol, normalizeLinkHref } from './href'

const ValidatedLink = Link.extend({
  addKeyboardShortcuts() {
    const exitLink = (boundary: 'start' | 'end') => {
      const { selection, storedMarks, tr } = this.editor.state
      const { $from } = selection
      const boundaryPosition = boundary === 'start' ? $from.start() : $from.end()

      if (!selection.empty || !$from.parent.isTextblock || $from.pos !== boundaryPosition) {
        return false
      }

      const link = (storedMarks ?? $from.marks()).find((mark) => mark.type.name === this.name)
      if (!link) {
        return false
      }

      this.editor.view.dispatch(tr.removeStoredMark(link))
      return true
    }

    return {
      ArrowLeft: () => exitLink('start'),
      ArrowRight: () => exitLink('end'),
    }
  },

  addAttributes() {
    return {
      href: {
        isRequired: true,
        parseHTML: (element) => normalizeLinkHref(element.getAttribute('href') ?? ''),
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

  parseHTML() {
    return [
      {
        tag: 'a[href]',
        getAttrs: (node) => {
          const href = normalizeLinkHref(node.getAttribute('href') ?? '')

          return href === '' ? false : { href }
        },
      },
    ]
  },
})

export const linkFeature = defineRichTextFeature({
  key: 'link',
  editorImplementation: true,
  serverImplementation: true,
  sharedExtensions: () => [
    ValidatedLink.configure({
      openOnClick: false,
      enableClickSelection: false,
      autolink: true,
      linkOnPaste: false,
      defaultProtocol: linkDefaultProtocol,
      isAllowedUri: (url, ctx) => {
        const normalizedHref = normalizeLinkHref(url, ctx.defaultProtocol)

        return normalizedHref !== '' && ctx.defaultValidate(normalizedHref)
      },
      shouldAutoLink: (url) => normalizeLinkHref(url) !== '',
    }),
  ],
})
