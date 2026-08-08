import { defineRichTextServerFeature } from '../../../server/feature'
import type { RichTextHtmlPolicy } from '../../../server/sanitize'
import { horizontalRuleFeature } from '../core/feature'

export const horizontalRuleHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['hr'],
}

export const horizontalRuleServerFeature = defineRichTextServerFeature(horizontalRuleFeature, {
  htmlPolicy: horizontalRuleHtmlPolicy,
})
