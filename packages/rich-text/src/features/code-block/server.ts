import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { codeBlockFeature } from './shared'

export const codeBlockHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['pre', 'code'],
}

export const codeBlockServerFeature = defineRichTextServerFeature(
  codeBlockFeature,
  codeBlockHtmlPolicy,
)
