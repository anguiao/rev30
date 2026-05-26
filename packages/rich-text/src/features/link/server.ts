import type { RichTextHtmlPolicy } from '../../server/sanitize'

const SAFE_LINK_TARGET = '_blank'
const SAFE_LINK_REL = 'noopener noreferrer nofollow'

export const linkHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['a'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: {
        ...attribs,
        target: SAFE_LINK_TARGET,
        rel: SAFE_LINK_REL,
      },
    }),
  },
}
