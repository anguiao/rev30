import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import type { HighlightColorOption } from './colors'
import { highlightFeature } from './shared'

export const setHighlightAction = defineRichTextAction(highlightFeature, {
  key: 'set-highlight',
  command:
    (color: HighlightColorOption['value']) =>
    ({ chain }) =>
      chain().focus().setHighlight({ color }).run(),
})

export const unsetHighlightAction = defineRichTextAction(highlightFeature, {
  key: 'unset-highlight',
  command:
    () =>
    ({ chain }) =>
      chain().focus().unsetHighlight().run(),
})

export const highlightEditorFeature = defineRichTextEditorFeature(highlightFeature, {})
