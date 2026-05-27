import type { RichTextHtmlPolicy } from '../../server/policy'

export const headingHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['h1', 'h2', 'h3'],
}
