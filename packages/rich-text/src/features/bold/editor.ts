import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { boldFeature } from './shared'

export const boldAction = defineRichTextAction(boldFeature, {
  key: boldFeature.key,
  run: (editor) => editor.chain().focus().toggleBold().run(),
  isActive: (editor) => editor.isActive('bold'),
})

export const boldEditorFeature = defineRichTextEditorFeature(boldFeature, {})
