import type sanitizeHtml from 'sanitize-html'

export interface RichTextHtmlPolicy {
  allowedTags?: sanitizeHtml.IDefaults['allowedTags']
  allowedAttributes?: sanitizeHtml.IDefaults['allowedAttributes']
  allowedSchemes?: sanitizeHtml.IDefaults['allowedSchemes']
  allowedStyles?: sanitizeHtml.IOptions['allowedStyles']
  transformTags?: sanitizeHtml.IOptions['transformTags']
}
