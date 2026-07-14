import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { listFeature } from './shared'

export const listActions = [
  defineRichTextAction(listFeature, {
    key: 'bullet-list',
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  }),
  defineRichTextAction(listFeature, {
    key: 'ordered-list',
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  }),
] as const

export const listEditorFeature = defineRichTextEditorFeature(listFeature, {})
