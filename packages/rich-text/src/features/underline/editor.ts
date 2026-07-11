import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { underlineFeature } from './shared'

export const underlineAction = defineRichTextAction(underlineFeature, {
  key: underlineFeature.key,
  run: (editor) => editor.chain().focus().toggleUnderline().run(),
  isActive: (editor) => editor.isActive('underline'),
})

export const underlineEditorFeature = defineRichTextEditorFeature(underlineFeature, {
  actions: [underlineAction],
})
