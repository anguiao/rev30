import type { RichTextPreset } from '../../core/preset'
import type { RichTextToolbarConfig } from '../toolbar'

export interface RichTextEditorPreset extends RichTextPreset {
  toolbar?: RichTextToolbarConfig
}

export function defineRichTextEditorPreset(preset: RichTextEditorPreset): RichTextEditorPreset {
  return preset
}
