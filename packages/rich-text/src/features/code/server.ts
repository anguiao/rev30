import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const codeHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['code'],
}
