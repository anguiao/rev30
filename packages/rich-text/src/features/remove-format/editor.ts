import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { removeFormatFeature } from './shared'

export const removeFormatAction = defineRichTextAction(removeFormatFeature, {
  key: removeFormatFeature.key,
  run: (editor) => editor.chain().focus().unsetAllMarks().run(),
})

export const removeFormatEditorFeature = defineRichTextEditorFeature(removeFormatFeature, {
  actions: [removeFormatAction],
})
