import type sanitizeHtml from 'sanitize-html'

export type RichTextTagTransform = (input: sanitizeHtml.Tag) => sanitizeHtml.Tag

export interface RichTextHtmlPolicy {
  allowedTags?: sanitizeHtml.IDefaults['allowedTags']
  allowedAttributes?: sanitizeHtml.IDefaults['allowedAttributes']
  allowedSchemes?: sanitizeHtml.IDefaults['allowedSchemes']
  allowedStyles?: sanitizeHtml.IOptions['allowedStyles']
  transformTags?: Record<string, RichTextTagTransform[]>
}
