import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const horizontalRuleHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['hr'],
}
