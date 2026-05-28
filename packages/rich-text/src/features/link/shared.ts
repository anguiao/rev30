import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'

const allowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const defaultProtocol = 'https'

function normalizeUrlForProtocolCheck(url: string, defaultProtocol: string) {
  const trimmedUrl = url.trim()

  if (/^[a-z][a-z\d+.-]*:/i.test(trimmedUrl)) {
    return trimmedUrl
  }

  return `${defaultProtocol}://${trimmedUrl}`
}

function hasAllowedProtocol(url: string, defaultProtocol: string) {
  try {
    const normalizedUrl = normalizeUrlForProtocolCheck(url, defaultProtocol)

    return allowedProtocols.has(new URL(normalizedUrl).protocol)
  } catch {
    return false
  }
}

export const linkFeature = defineRichTextFeature({
  key: 'link',
  extension: () =>
    Link.configure({
      openOnClick: false,
      enableClickSelection: true,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol,
      isAllowedUri: (url, ctx) => {
        if (!ctx.defaultValidate(url)) {
          return false
        }

        return hasAllowedProtocol(url, ctx.defaultProtocol)
      },
      shouldAutoLink: (url) => hasAllowedProtocol(url, defaultProtocol),
    }),
})
