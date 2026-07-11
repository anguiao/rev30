import { baseServerFeature } from '../../features/base/server'
import { blockquoteServerFeature } from '../../features/blockquote/server'
import { boldServerFeature } from '../../features/bold/server'
import { codeBlockServerFeature } from '../../features/code-block/server'
import { headingServerFeature } from '../../features/heading/server'
import { highlightServerFeature } from '../../features/highlight/server'
import { horizontalRuleServerFeature } from '../../features/horizontal-rule/server'
import {
  createImageServerFeature,
  type RichTextImageServerOptions,
} from '../../features/image/server'
import { inlineCodeServerFeature } from '../../features/inline-code/server'
import { italicServerFeature } from '../../features/italic/server'
import { linkServerFeature } from '../../features/link/server'
import { listServerFeature } from '../../features/list/server'
import { strikeServerFeature } from '../../features/strike/server'
import { textAlignServerFeature } from '../../features/text-align/server'
import { underlineServerFeature } from '../../features/underline/server'
import { allRichTextPreset } from '../../presets/all'
import { defineRichTextServerPreset } from './types'

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
    linkServerFeature,
    headingServerFeature,
    textAlignServerFeature,
    listServerFeature,
    blockquoteServerFeature,
    codeBlockServerFeature,
    horizontalRuleServerFeature,
    createImageServerFeature(options.image),
  ])
}
