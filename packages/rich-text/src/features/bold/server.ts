import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const boldHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['strong'],
}
