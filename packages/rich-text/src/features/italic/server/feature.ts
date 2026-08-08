import { defineRichTextServerFeature } from '../../../server/feature'
import type { RichTextHtmlPolicy } from '../../../server/sanitize'
import { italicFeature } from '../core/feature'

export const italicHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['em'],
}

export const italicServerFeature = defineRichTextServerFeature(italicFeature, {
  htmlPolicy: italicHtmlPolicy,
})
