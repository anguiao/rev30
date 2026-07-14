import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { blockquoteFeature } from './shared'

export const blockquoteAction = defineRichTextAction(blockquoteFeature, {
  key: blockquoteFeature.key,
  run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  isActive: (editor) => editor.isActive('blockquote'),
})

export const blockquoteEditorFeature = defineRichTextEditorFeature(blockquoteFeature, {})
