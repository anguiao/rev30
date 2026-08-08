import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/sanitize'
import { underlineFeature } from './core/feature'

export const underlineHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['u'],
}

export const underlineServerFeature = defineRichTextServerFeature(underlineFeature, {
  htmlPolicy: underlineHtmlPolicy,
})
