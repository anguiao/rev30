import { defineRichTextPreset } from '../core/preset'
import { baseFeature } from '../features/base/shared'
import { boldFeature } from '../features/bold/shared'
import { headingFeature } from '../features/heading/shared'
import { historyFeature } from '../features/history/shared'
import { italicFeature } from '../features/italic/shared'
import { linkFeature } from '../features/link/shared'
import { listFeature } from '../features/list/shared'

export const compactRichTextPreset = defineRichTextPreset({
  key: 'compact',
  features: [
    baseFeature,
    historyFeature,
    boldFeature,
    italicFeature,
    linkFeature,
    headingFeature,
    listFeature,
  ],
})
