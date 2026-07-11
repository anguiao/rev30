import { baseServerFeature } from '../../features/base/server'
import { boldServerFeature } from '../../features/bold/server'
import { headingServerFeature } from '../../features/heading/server'
import { italicServerFeature } from '../../features/italic/server'
import { linkServerFeature } from '../../features/link/server'
import { listServerFeature } from '../../features/list/server'
import { compactRichTextPreset } from '../../presets/compact'
import { defineRichTextServerPreset } from './types'

export const compactRichTextServerPreset = defineRichTextServerPreset(compactRichTextPreset, [
  baseServerFeature,
  boldServerFeature,
  italicServerFeature,
  linkServerFeature,
  headingServerFeature,
  listServerFeature,
])
