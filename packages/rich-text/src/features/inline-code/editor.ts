import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { inlineCodeFeature } from './shared'

export const inlineCodeAction = defineRichTextAction(inlineCodeFeature, {
  key: inlineCodeFeature.key,
  run: (editor) => editor.chain().focus().toggleCode().run(),
  isActive: (editor) => editor.isActive('code'),
  canRun: (editor) => editor.can().chain().focus().toggleCode().run(),
})

export const inlineCodeEditorFeature = defineRichTextEditorFeature(inlineCodeFeature, {
  actions: [inlineCodeAction],
})
