import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const underlineHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['u'],
}
