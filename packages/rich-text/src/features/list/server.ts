import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const listHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['ul', 'ol', 'li'],
}
