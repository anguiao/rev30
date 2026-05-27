import { defineRichTextPreset } from '../core/preset'
import { defineRichTextToolbarLayout } from '../core/toolbar'
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

export const compactRichTextToolbarLayout = defineRichTextToolbarLayout([
  { key: 'marks', items: ['bold', 'italic', 'underline'] },
  { key: 'blocks', items: ['heading-1', 'heading-2', 'heading-3', 'blockquote'] },
  { key: 'lists', items: ['bullet-list', 'ordered-list'] },
  { key: 'insert', items: ['horizontal-rule'] },
  { key: 'history', items: ['undo', 'redo'] },
])
