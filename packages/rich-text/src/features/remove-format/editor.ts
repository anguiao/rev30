import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { removeFormatFeature } from './shared'

export const removeFormatAction = defineRichTextAction(removeFormatFeature, {
  key: removeFormatFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().unsetAllMarks().run(),
})

export const removeFormatEditorFeature = defineRichTextEditorFeature(removeFormatFeature, {})
