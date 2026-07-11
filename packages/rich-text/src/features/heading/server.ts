import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { headingFeature } from './shared'

export const headingHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['h1', 'h2', 'h3'],
}

export const headingServerFeature = defineRichTextServerFeature(headingFeature, {
  htmlPolicy: headingHtmlPolicy,
})
