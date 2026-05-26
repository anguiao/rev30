import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const italicHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['em'],
}
