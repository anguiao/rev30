import { defineRichTextServerFeature } from '../../../server/feature'
import type { RichTextHtmlPolicy } from '../../../server/sanitize'
import { baseFeature } from '../core/feature'

export const baseHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['p', 'br'],
}

export const baseServerFeature = defineRichTextServerFeature(baseFeature, {
  htmlPolicy: baseHtmlPolicy,
})
