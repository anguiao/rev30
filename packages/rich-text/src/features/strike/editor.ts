import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { strikeFeature } from './shared'

export const strikeAction = defineRichTextAction(strikeFeature, {
  key: strikeFeature.key,
  run: (editor) => editor.chain().focus().toggleStrike().run(),
  isActive: (editor) => editor.isActive('strike'),
})

export const strikeEditorFeature = defineRichTextEditorFeature(strikeFeature, {
  actions: [strikeAction],
})
