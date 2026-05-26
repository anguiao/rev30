import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const blockquoteHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['blockquote'],
}
