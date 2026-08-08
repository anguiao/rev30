import { baseServerFeature } from '../../features/base/server/feature'
import { blockquoteServerFeature } from '../../features/blockquote/server/feature'
import { boldServerFeature } from '../../features/bold/server/feature'
import { codeBlockServerFeature } from '../../features/code-block/server/feature'
import { headingServerFeature } from '../../features/heading/server/feature'
import { highlightServerFeature } from '../../features/highlight/server/feature'
import { horizontalRuleServerFeature } from '../../features/horizontal-rule/server/feature'
import {
  createImageServerFeature,
  type RichTextImageServerOptions,
} from '../../features/image/server/feature'
import { inlineCodeServerFeature } from '../../features/inline-code/server/feature'
import { italicServerFeature } from '../../features/italic/server/feature'
import { linkServerFeature } from '../../features/link/server/feature'
import { listServerFeature } from '../../features/list/server/feature'
import { strikeServerFeature } from '../../features/strike/server/feature'
import { textAlignServerFeature } from '../../features/text-align/server/feature'
import { textStyleServerFeature } from '../../features/text-style/server/feature'
import { tableServerFeature } from '../../features/table/server/feature'
import { underlineServerFeature } from '../../features/underline/server/feature'
import { allRichTextPreset } from '../../core/presets/all'
import { defineRichTextServerPreset } from '../preset'

export interface AllRichTextServerPresetOptions {
  image: RichTextImageServerOptions
}

export function createAllRichTextServerPreset(options: AllRichTextServerPresetOptions) {
  return defineRichTextServerPreset(allRichTextPreset, [
    baseServerFeature,
    boldServerFeature,
    italicServerFeature,
    underlineServerFeature,
    strikeServerFeature,
    inlineCodeServerFeature,
    highlightServerFeature,
    textStyleServerFeature,
    linkServerFeature,
    headingServerFeature,
    textAlignServerFeature,
    blockquoteServerFeature,
    codeBlockServerFeature,
    listServerFeature,
    horizontalRuleServerFeature,
    createImageServerFeature(options.image),
    tableServerFeature,
  ])
}
