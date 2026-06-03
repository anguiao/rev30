import { baseHtmlPolicy } from '../../features/base/server'
import { blockquoteHtmlPolicy } from '../../features/blockquote/server'
import { boldHtmlPolicy } from '../../features/bold/server'
import { headingHtmlPolicy } from '../../features/heading/server'
import { highlightHtmlPolicy } from '../../features/highlight/server'
import { horizontalRuleHtmlPolicy } from '../../features/horizontal-rule/server'
import { createImageHtmlPolicy, type RichTextImageServerOptions } from '../../features/image/server'
import { italicHtmlPolicy } from '../../features/italic/server'
import { linkHtmlPolicy } from '../../features/link/server'
import { listHtmlPolicy } from '../../features/list/server'
import { underlineHtmlPolicy } from '../../features/underline/server'
import { compactRichTextPreset } from '../../presets'
import { defineRichTextServerPreset, type RichTextServerPreset } from './types'

export interface CompactRichTextServerPresetOptions {
  image: RichTextImageServerOptions
}

function createCompactRichTextHtmlPolicies(options: CompactRichTextServerPresetOptions) {
  return [
    baseHtmlPolicy,
    boldHtmlPolicy,
    italicHtmlPolicy,
    underlineHtmlPolicy,
    highlightHtmlPolicy,
    linkHtmlPolicy,
    headingHtmlPolicy,
    listHtmlPolicy,
    blockquoteHtmlPolicy,
    horizontalRuleHtmlPolicy,
    createImageHtmlPolicy(options.image),
  ]
}

export function createCompactRichTextServerPreset(
  options: CompactRichTextServerPresetOptions,
): RichTextServerPreset {
  return defineRichTextServerPreset({
    ...compactRichTextPreset,
    htmlPolicies: createCompactRichTextHtmlPolicies(options),
  })
}
