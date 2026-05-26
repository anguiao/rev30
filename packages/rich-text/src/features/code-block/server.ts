import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const codeBlockHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['pre'],
}
