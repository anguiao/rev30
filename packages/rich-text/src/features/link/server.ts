import type sanitizeHtml from 'sanitize-html'
import type { RichTextHtmlPolicy } from '../../server/policy'

function normalizeHref(href: unknown) {
  if (typeof href !== 'string') {
    return null
  }

  const trimmedHref = href.trim()

  if (!trimmedHref) {
    return null
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(trimmedHref) || trimmedHref.startsWith('//')) {
    return trimmedHref
  }

  return `https://${trimmedHref}`
}

const transformAnchor: sanitizeHtml.Transformer = (tagName, attribs) => {
  const href = normalizeHref(attribs.href)

  return {
    tagName,
    attribs: {
      ...(href ? { href } : {}),
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
    },
  }
}

export const linkHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['a'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: transformAnchor,
  },
}
