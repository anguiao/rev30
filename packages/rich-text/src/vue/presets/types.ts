import type { RichTextPreset } from '../../core/preset'
import type { RichTextToolbarConfig } from '../../core/toolbar'

export interface RichTextEditorPreset {
  preset: RichTextPreset
  toolbar?: RichTextToolbarConfig
}

export function defineRichTextEditorPreset(preset: RichTextEditorPreset): RichTextEditorPreset {
  return preset
}
