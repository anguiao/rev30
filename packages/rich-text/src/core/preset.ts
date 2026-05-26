import type { AnyExtension } from '@tiptap/core'
import type { RichTextFeature } from './feature'

export interface RichTextPreset {
  key: string
  features: RichTextFeature[]
}

export function defineRichTextPreset(preset: RichTextPreset): RichTextPreset {
  return preset
}

export function collectRichTextExtensions(preset: RichTextPreset): AnyExtension[] {
  return preset.features.flatMap((feature) => feature.extension())
}
