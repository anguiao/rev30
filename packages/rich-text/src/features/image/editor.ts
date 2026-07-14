import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { imageFeature, type RichTextImageAttrs } from './shared'

export const insertImageAction = defineRichTextAction(imageFeature, {
  key: 'insert-image',
  run: (editor, attrs: RichTextImageAttrs) =>
    editor.chain().focus().insertContent({ type: 'image', attrs }).run(),
})

export const updateImageAction = defineRichTextAction(imageFeature, {
  key: 'update-image',
  run: (editor, attrs: RichTextImageAttrs) =>
    editor.chain().focus().updateAttributes('image', attrs).run(),
})

export const imageEditorFeature = defineRichTextEditorFeature(imageFeature, {})
