import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { headingFeature } from './shared'

export const headingActions = [
  defineRichTextAction(headingFeature, {
    key: 'heading-1',
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
  }),
  defineRichTextAction(headingFeature, {
    key: 'heading-2',
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
  }),
  defineRichTextAction(headingFeature, {
    key: 'heading-3',
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
  }),
] as const

export const headingEditorFeature = defineRichTextEditorFeature(headingFeature, {})
