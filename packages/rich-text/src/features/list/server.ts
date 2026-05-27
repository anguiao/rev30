import type { RichTextHtmlPolicy } from '../../server/policy'

export const listHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['ul', 'ol', 'li'],
}
