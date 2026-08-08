import { defineRichTextPreset } from '../preset'
import { baseFeature } from '../../features/base/core/feature'
import { blockquoteFeature } from '../../features/blockquote/core/feature'
import { boldFeature } from '../../features/bold/core/feature'
import { characterCountFeature } from '../../features/character-count/core/feature'
import { codeBlockFeature } from '../../features/code-block/core/feature'
import { elementPathFeature } from '../../features/element-path/core/feature'
import { headingFeature } from '../../features/heading/core/feature'
import { historyFeature } from '../../features/history/core/feature'
import { highlightFeature } from '../../features/highlight/core/feature'
import { horizontalRuleFeature } from '../../features/horizontal-rule/core/feature'
import { imageFeature } from '../../features/image/core/feature'
import { inlineCodeFeature } from '../../features/inline-code/core/feature'
import { italicFeature } from '../../features/italic/core/feature'
import { linkFeature } from '../../features/link/core/feature'
import { listFeature } from '../../features/list/core/feature'
import { removeFormatFeature } from '../../features/remove-format/core/feature'
import { searchReplaceFeature } from '../../features/search-replace/core/feature'
import { strikeFeature } from '../../features/strike/core/feature'
import { textAlignFeature } from '../../features/text-align/core/feature'
import { textStyleFeature } from '../../features/text-style/core/feature'
import { tableFeature } from '../../features/table/core/feature'
import { underlineFeature } from '../../features/underline/core/feature'

export const allRichTextPreset = defineRichTextPreset({
  key: 'all',
  features: [
    baseFeature,
    historyFeature,
    characterCountFeature,
    searchReplaceFeature,
    boldFeature,
    italicFeature,
    underlineFeature,
    strikeFeature,
    inlineCodeFeature,
    highlightFeature,
    textStyleFeature,
    linkFeature,
    removeFormatFeature,
    headingFeature,
    textAlignFeature,
    blockquoteFeature,
    codeBlockFeature,
    listFeature,
    horizontalRuleFeature,
    imageFeature,
    tableFeature,
    elementPathFeature,
  ],
})
