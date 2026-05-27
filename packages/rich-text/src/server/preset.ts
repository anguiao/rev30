import type { RichTextHtmlPolicy } from '../core/html'
import type { RichTextPreset } from '../core/preset'

export interface RichTextServerPreset {
  preset: RichTextPreset
  htmlPolicies: RichTextHtmlPolicy[]
}

export function defineRichTextServerPreset(preset: RichTextServerPreset): RichTextServerPreset {
  return preset
}
