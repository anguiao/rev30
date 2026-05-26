import type { RichTextPreset } from '../core/preset'
import { blockquoteHtmlPolicy } from '../features/blockquote/server'
import { blockquoteFeature } from '../features/blockquote/shared'
import { boldHtmlPolicy } from '../features/bold/server'
import { boldFeature } from '../features/bold/shared'
import { codeBlockHtmlPolicy } from '../features/code-block/server'
import { codeBlockFeature } from '../features/code-block/shared'
import { codeHtmlPolicy } from '../features/code/server'
import { codeFeature } from '../features/code/shared'
import { baseFeature } from '../features/base/shared'
import { headingHtmlPolicy } from '../features/heading/server'
import { headingFeature } from '../features/heading/shared'
import { horizontalRuleHtmlPolicy } from '../features/horizontal-rule/server'
import { horizontalRuleFeature } from '../features/horizontal-rule/shared'
import { italicHtmlPolicy } from '../features/italic/server'
import { italicFeature } from '../features/italic/shared'
import { linkHtmlPolicy } from '../features/link/server'
import { linkFeature } from '../features/link/shared'
import { listHtmlPolicy } from '../features/list/server'
import { listFeature } from '../features/list/shared'
import { strikeHtmlPolicy } from '../features/strike/server'
import { strikeFeature } from '../features/strike/shared'
import { underlineHtmlPolicy } from '../features/underline/server'
import { underlineFeature } from '../features/underline/shared'
import type { RichTextHtmlPolicy } from './sanitize'

export const baseDocumentPolicy: RichTextHtmlPolicy = {
  allowedTags: ['p', 'br'],
}

export type RichTextRuntimePolicy = RichTextHtmlPolicy

export const defaultPolicyByFeatureKey: Record<string, RichTextRuntimePolicy> = {
  [baseFeature.key]: baseDocumentPolicy,
  [boldFeature.key]: boldHtmlPolicy,
  [italicFeature.key]: italicHtmlPolicy,
  [underlineFeature.key]: underlineHtmlPolicy,
  [strikeFeature.key]: strikeHtmlPolicy,
  [headingFeature.key]: headingHtmlPolicy,
  [blockquoteFeature.key]: blockquoteHtmlPolicy,
  [listFeature.key]: listHtmlPolicy,
  [horizontalRuleFeature.key]: horizontalRuleHtmlPolicy,
  [linkFeature.key]: linkHtmlPolicy,
  [codeFeature.key]: codeHtmlPolicy,
  [codeBlockFeature.key]: codeBlockHtmlPolicy,
}

export function getRichTextHtmlPolicies(preset: RichTextPreset): RichTextRuntimePolicy[] {
  return preset.features.flatMap((feature) => {
    const policy = defaultPolicyByFeatureKey[feature.key]

    return policy ? [policy] : []
  })
}
