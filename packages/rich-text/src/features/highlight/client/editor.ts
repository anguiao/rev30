import { defineRichTextAction } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import type { HighlightColor } from '../core/colors'
import { highlightFeature } from '../core/feature'

export const setHighlightAction = defineRichTextAction(highlightFeature, {
  key: 'set-highlight',
  command: ({ chain }, color: HighlightColor) => chain().focus().setHighlight({ color }).run(),
})

export const unsetHighlightAction = defineRichTextAction(highlightFeature, {
  key: 'unset-highlight',
  command: ({ chain }) => chain().focus().unsetHighlight().run(),
})

export const highlightEditorFeature = defineRichTextEditorFeature(highlightFeature, {})
