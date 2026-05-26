import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const strikeHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['s'],
}
