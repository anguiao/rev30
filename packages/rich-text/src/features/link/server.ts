import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/policy'
import { normalizeLinkHref } from './href'

const transformAnchor: RichTextTagTransform = ({ tagName, attribs }) => {
  const href = normalizeLinkHref(attribs.href ?? '')

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
    a: [transformAnchor],
  },
}
