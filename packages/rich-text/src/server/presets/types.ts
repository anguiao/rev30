import type { RichTextPreset } from '../../core/preset'
import type { RichTextHtmlPolicy } from '../policy'

export interface RichTextServerPreset extends RichTextPreset {
  htmlPolicies: RichTextHtmlPolicy[]
}

export function defineRichTextServerPreset(preset: RichTextServerPreset): RichTextServerPreset {
  return preset
}
