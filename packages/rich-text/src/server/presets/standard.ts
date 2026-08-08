import { baseServerFeature } from '../../features/base/server/feature'
import { blockquoteServerFeature } from '../../features/blockquote/server/feature'
import { boldServerFeature } from '../../features/bold/server/feature'
import { headingServerFeature } from '../../features/heading/server/feature'
import { highlightServerFeature } from '../../features/highlight/server/feature'
import { horizontalRuleServerFeature } from '../../features/horizontal-rule/server/feature'
import {
  createImageServerFeature,
  type RichTextImageServerOptions,
} from '../../features/image/server/feature'
import { italicServerFeature } from '../../features/italic/server/feature'
import { linkServerFeature } from '../../features/link/server/feature'
import { listServerFeature } from '../../features/list/server/feature'
import { strikeServerFeature } from '../../features/strike/server/feature'
import { textAlignServerFeature } from '../../features/text-align/server/feature'
import { underlineServerFeature } from '../../features/underline/server/feature'
import { standardRichTextPreset } from '../../core/presets/standard'
import { defineRichTextServerPreset, type RichTextServerPreset } from '../preset'

export interface StandardRichTextServerPresetOptions {
  image: RichTextImageServerOptions
}

export function createStandardRichTextServerPreset(
  options: StandardRichTextServerPresetOptions,
): RichTextServerPreset {
  return defineRichTextServerPreset(standardRichTextPreset, [
    baseServerFeature,
    boldServerFeature,
    italicServerFeature,
    underlineServerFeature,
    strikeServerFeature,
    highlightServerFeature,
    linkServerFeature,
    headingServerFeature,
    textAlignServerFeature,
    blockquoteServerFeature,
    listServerFeature,
    horizontalRuleServerFeature,
    createImageServerFeature(options.image),
  ])
}
