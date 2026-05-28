import type { RichTextPreset } from '../../core/preset'
import type { RichTextToolbarConfig } from '../toolbar/types'

export interface RichTextEditorPreset {
  preset: RichTextPreset
  toolbar?: RichTextToolbarConfig
}

export function defineRichTextEditorPreset(preset: RichTextEditorPreset): RichTextEditorPreset {
  return preset
}
