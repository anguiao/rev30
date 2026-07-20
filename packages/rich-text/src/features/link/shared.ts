import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'
import { linkDefaultProtocol, normalizeLinkHref } from './href'

const ValidatedLink = Link.extend({
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
