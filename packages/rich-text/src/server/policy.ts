import type sanitizeHtml from 'sanitize-html'

export interface RichTextHtmlPolicy {
  allowedTags?: sanitizeHtml.IDefaults['allowedTags']
  allowedAttributes?: sanitizeHtml.IDefaults['allowedAttributes']
  allowedSchemes?: sanitizeHtml.IDefaults['allowedSchemes']
  transformTags?: sanitizeHtml.IOptions['transformTags']
}
