import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import type { HighlightColorOption } from './colors'
import { highlightFeature } from './shared'

export const setHighlightAction = defineRichTextAction(highlightFeature, {
  key: 'set-highlight',
  run: (editor, color: HighlightColorOption['value']) => editor.commands.setHighlight({ color }),
})

export const unsetHighlightAction = defineRichTextAction(highlightFeature, {
  key: 'unset-highlight',
  run: (editor) => editor.commands.unsetHighlight(),
})

export const highlightEditorFeature = defineRichTextEditorFeature(highlightFeature, {
  actions: [setHighlightAction, unsetHighlightAction],
})
