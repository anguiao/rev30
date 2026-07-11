import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { textAlignFeature } from './shared'

export const textAlignActions = [
  defineRichTextAction(textAlignFeature, {
    key: 'text-align-left',
    run: (editor) => editor.chain().focus().setTextAlign('left').run(),
    isActive: (editor) =>
      editor.isActive('paragraph', { textAlign: 'left' }) ||
      editor.isActive('heading', { textAlign: 'left' }),
  }),
  defineRichTextAction(textAlignFeature, {
    key: 'text-align-center',
    run: (editor) => editor.chain().focus().setTextAlign('center').run(),
    isActive: (editor) =>
      editor.isActive('paragraph', { textAlign: 'center' }) ||
      editor.isActive('heading', { textAlign: 'center' }),
  }),
  defineRichTextAction(textAlignFeature, {
    key: 'text-align-right',
    run: (editor) => editor.chain().focus().setTextAlign('right').run(),
    isActive: (editor) =>
      editor.isActive('paragraph', { textAlign: 'right' }) ||
      editor.isActive('heading', { textAlign: 'right' }),
  }),
] as const

export const textAlignEditorFeature = defineRichTextEditorFeature(textAlignFeature, {
  actions: textAlignActions,
})
