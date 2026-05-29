import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'
import { isAllowedLinkHref, linkDefaultProtocol, normalizeLinkHref } from './href'

export const linkFeature = defineRichTextFeature({
  key: 'link',
  extension: () =>
    Link.configure({
      openOnClick: false,
      enableClickSelection: true,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: linkDefaultProtocol,
      isAllowedUri: (url, ctx) => {
        if (!ctx.defaultValidate(url)) {
          return false
        }

        return isAllowedLinkHref(normalizeLinkHref(url, ctx.defaultProtocol))
      },
      shouldAutoLink: (url) => isAllowedLinkHref(normalizeLinkHref(url)),
    }),
})
