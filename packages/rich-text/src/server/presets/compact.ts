import { baseServerFeature } from '../../features/base/server/feature'
import { boldServerFeature } from '../../features/bold/server/feature'
import { headingServerFeature } from '../../features/heading/server/feature'
import { italicServerFeature } from '../../features/italic/server/feature'
import { linkServerFeature } from '../../features/link/server/feature'
import { listServerFeature } from '../../features/list/server/feature'
import { compactRichTextPreset } from '../../core/presets/compact'
import { defineRichTextServerPreset } from '../preset'

export const compactRichTextServerPreset = defineRichTextServerPreset(compactRichTextPreset, [
  baseServerFeature,
  boldServerFeature,
  italicServerFeature,
  linkServerFeature,
  headingServerFeature,
  listServerFeature,
])
