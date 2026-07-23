import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/sanitize'
import { listFeature } from './shared'

export const listHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['ul', 'ol', 'li'],
}

export const listServerFeature = defineRichTextServerFeature(listFeature, {
  htmlPolicy: listHtmlPolicy,
})
