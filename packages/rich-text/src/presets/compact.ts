import { defineRichTextPreset } from '../core/preset'
import { baseFeature } from '../features/base/shared'
import { blockquoteFeature } from '../features/blockquote/shared'
import { boldFeature } from '../features/bold/shared'
import { headingFeature } from '../features/heading/shared'
import { historyFeature } from '../features/history/shared'
import { highlightFeature } from '../features/highlight/shared'
import { horizontalRuleFeature } from '../features/horizontal-rule/shared'
import { imageFeature } from '../features/image/shared'
import { italicFeature } from '../features/italic/shared'
import { linkFeature } from '../features/link/shared'
import { listFeature } from '../features/list/shared'
import { removeFormatFeature } from '../features/remove-format/shared'
import { strikeFeature } from '../features/strike/shared'
import { underlineFeature } from '../features/underline/shared'

export const compactRichTextPreset = defineRichTextPreset({
  key: 'compact',
  features: [
    baseFeature,
    historyFeature,
    boldFeature,
    italicFeature,
    underlineFeature,
    strikeFeature,
    highlightFeature,
    linkFeature,
    removeFormatFeature,
    headingFeature,
    blockquoteFeature,
    listFeature,
    horizontalRuleFeature,
    imageFeature,
  ],
})
