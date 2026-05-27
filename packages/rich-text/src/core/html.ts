import type sanitizeHtml from 'sanitize-html'

export interface RichTextHtmlPolicy {
  allowedTags?: string[]
  allowedAttributes?: sanitizeHtml.IOptions['allowedAttributes']
  allowedSchemes?: string[]
  transformTags?: sanitizeHtml.IOptions['transformTags']
}
