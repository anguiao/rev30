import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const headingHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['h1', 'h2', 'h3'],
}
