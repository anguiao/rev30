import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { boldFeature } from './shared'

export const boldHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['strong'],
}

export const boldServerFeature = defineRichTextServerFeature(boldFeature, {
  htmlPolicy: boldHtmlPolicy,
})
