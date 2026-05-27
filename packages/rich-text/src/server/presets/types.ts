import type { RichTextPreset } from '../../core/preset'
import type { RichTextHtmlPolicy } from '../policy'

export interface RichTextServerPreset {
  preset: RichTextPreset
  htmlPolicies: RichTextHtmlPolicy[]
}

export function defineRichTextServerPreset(preset: RichTextServerPreset): RichTextServerPreset {
  return preset
}
