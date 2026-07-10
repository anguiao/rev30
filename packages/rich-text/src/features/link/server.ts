import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/policy'
import { isAllowedLinkHref, linkAllowedSchemes, normalizeLinkHref } from './href'

const transformAnchor: RichTextTagTransform = ({ tagName, attribs }) => {
  const normalizedHref = normalizeLinkHref(attribs.href ?? '')
  const href = isAllowedLinkHref(normalizedHref) ? normalizedHref : ''

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
  allowedSchemes: [...linkAllowedSchemes],
  transformTags: {
    a: [transformAnchor],
  },
}
