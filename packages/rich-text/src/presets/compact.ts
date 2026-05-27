import { defineRichTextPreset } from '../core/preset'
import { baseFeature } from '../features/base/shared'
import { blockquoteFeature } from '../features/blockquote/shared'
import { boldFeature } from '../features/bold/shared'
import { headingFeature } from '../features/heading/shared'
import { historyFeature } from '../features/history/shared'
import { horizontalRuleFeature } from '../features/horizontal-rule/shared'
import { italicFeature } from '../features/italic/shared'
import { listFeature } from '../features/list/shared'
import { underlineFeature } from '../features/underline/shared'

export const compactRichTextPreset = defineRichTextPreset({
  key: 'compact',
  features: [
    baseFeature,
    boldFeature,
    italicFeature,
    underlineFeature,
    headingFeature,
    blockquoteFeature,
    listFeature,
    horizontalRuleFeature,
    historyFeature,
  ],
})
