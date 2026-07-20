import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { inlineCodeFeature } from './shared'

export const inlineCodeAction = defineRichTextAction(inlineCodeFeature, {
  key: inlineCodeFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().toggleCode().run(),
  isActive: (editor) => editor.isActive('code'),
})

export const inlineCodeEditorFeature = defineRichTextEditorFeature(inlineCodeFeature, {})
