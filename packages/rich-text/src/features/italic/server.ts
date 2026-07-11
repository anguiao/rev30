import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { italicFeature } from './shared'

export const italicHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['em'],
}

export const italicServerFeature = defineRichTextServerFeature(italicFeature, italicHtmlPolicy)
