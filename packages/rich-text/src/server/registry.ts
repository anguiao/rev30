import type { RichTextPreset } from '../core/preset'
import { blockquoteHtmlPolicy } from '../features/blockquote/server'
import { boldHtmlPolicy } from '../features/bold/server'
import { codeBlockHtmlPolicy } from '../features/code-block/server'
import { codeHtmlPolicy } from '../features/code/server'
import { headingHtmlPolicy } from '../features/heading/server'
import { horizontalRuleHtmlPolicy } from '../features/horizontal-rule/server'
import { italicHtmlPolicy } from '../features/italic/server'
import { linkHtmlPolicy } from '../features/link/server'
import { listHtmlPolicy } from '../features/list/server'
import { strikeHtmlPolicy } from '../features/strike/server'
import { underlineHtmlPolicy } from '../features/underline/server'
import type { RichTextHtmlPolicy } from './sanitize'

export const baseDocumentPolicy: RichTextHtmlPolicy = {
  allowedTags: ['p', 'br'],
}

export const defaultPolicyByFeatureKey: Record<string, RichTextHtmlPolicy> = {
  base: baseDocumentPolicy,
  bold: boldHtmlPolicy,
  italic: italicHtmlPolicy,
  underline: underlineHtmlPolicy,
  strike: strikeHtmlPolicy,
  heading: headingHtmlPolicy,
  blockquote: blockquoteHtmlPolicy,
  list: listHtmlPolicy,
  'horizontal-rule': horizontalRuleHtmlPolicy,
  link: linkHtmlPolicy,
  code: codeHtmlPolicy,
  'code-block': codeBlockHtmlPolicy,
}

export function getRichTextHtmlPolicies(preset: RichTextPreset): RichTextHtmlPolicy[] {
  return preset.features.flatMap((feature) => {
    const policy = defaultPolicyByFeatureKey[feature.key]

    return policy ? [policy] : []
  })
}
