import { defineRichTextEditorFeature } from '../../editor/feature'
import { tableFeature } from './shared'

export const tableEditorFeature = defineRichTextEditorFeature(tableFeature, {})
