import { baseHtmlPolicy } from '../../features/base/server'
import { blockquoteHtmlPolicy } from '../../features/blockquote/server'
import { boldHtmlPolicy } from '../../features/bold/server'
import { headingHtmlPolicy } from '../../features/heading/server'
import { horizontalRuleHtmlPolicy } from '../../features/horizontal-rule/server'
import { italicHtmlPolicy } from '../../features/italic/server'
import { listHtmlPolicy } from '../../features/list/server'
import { underlineHtmlPolicy } from '../../features/underline/server'
import { compactRichTextPreset } from '../../presets'
import { defineRichTextServerPreset } from '../preset'

export const compactRichTextHtmlPolicies = [
  baseHtmlPolicy,
  boldHtmlPolicy,
  italicHtmlPolicy,
  underlineHtmlPolicy,
  headingHtmlPolicy,
  blockquoteHtmlPolicy,
  listHtmlPolicy,
  horizontalRuleHtmlPolicy,
]

export const compactRichTextServerPreset = defineRichTextServerPreset({
  preset: compactRichTextPreset,
  htmlPolicies: compactRichTextHtmlPolicies,
})
