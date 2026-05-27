import type { RichTextPreset } from '../core/preset'
import type { RichTextToolbarItem, RichTextToolbarLayout } from '../core/toolbar'

export interface RichTextEditorPreset {
  preset: RichTextPreset
  toolbarLayout?: RichTextToolbarLayout
  toolbarItems?: RichTextToolbarItem[]
}

export function defineRichTextEditorPreset(preset: RichTextEditorPreset): RichTextEditorPreset {
  return preset
}
