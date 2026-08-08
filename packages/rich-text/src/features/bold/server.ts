import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/sanitize'
import { boldFeature } from './core/feature'

export const boldHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['strong'],
}

export const boldServerFeature = defineRichTextServerFeature(boldFeature, {
  htmlPolicy: boldHtmlPolicy,
})
