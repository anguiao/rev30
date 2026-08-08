import { defineRichTextPreset } from '../preset'
import { baseFeature } from '../../features/base/core/feature'
import { boldFeature } from '../../features/bold/core/feature'
import { headingFeature } from '../../features/heading/core/feature'
import { historyFeature } from '../../features/history/core/feature'
import { italicFeature } from '../../features/italic/core/feature'
import { linkFeature } from '../../features/link/core/feature'
import { listFeature } from '../../features/list/core/feature'

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
