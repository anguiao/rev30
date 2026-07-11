import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { codeBlockFeature } from './shared'

export const codeBlockAction = defineRichTextAction(codeBlockFeature, {
  key: codeBlockFeature.key,
  run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  isActive: (editor) => editor.isActive('codeBlock'),
  canRun: (editor) => editor.can().chain().focus().toggleCodeBlock().run(),
})

export const codeBlockEditorFeature = defineRichTextEditorFeature(codeBlockFeature, {
  actions: [codeBlockAction],
})
