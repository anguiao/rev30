import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'
import { isAllowedLinkHref, linkDefaultProtocol, normalizeLinkHref } from './href'

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
            !isAllowedLinkHref(normalizeLinkHref(value))
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
  extension: () =>
    ValidatedLink.configure({
      openOnClick: false,
      enableClickSelection: true,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: linkDefaultProtocol,
      isAllowedUri: (url, ctx) => {
        const normalizedHref = normalizeLinkHref(url, ctx.defaultProtocol)

        if (!ctx.defaultValidate(normalizedHref)) {
          return false
        }

        return isAllowedLinkHref(normalizedHref)
      },
      shouldAutoLink: (url) => isAllowedLinkHref(normalizeLinkHref(url)),
    }),
})
