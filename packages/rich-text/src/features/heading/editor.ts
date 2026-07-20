import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { headingFeature } from './shared'

export const headingActions = [
  defineRichTextAction(headingFeature, {
    key: 'heading-1',
    command:
      () =>
      ({ chain }) =>
        chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
  }),
  defineRichTextAction(headingFeature, {
    key: 'heading-2',
    command:
      () =>
      ({ chain }) =>
        chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
  }),
  defineRichTextAction(headingFeature, {
    key: 'heading-3',
    command:
      () =>
      ({ chain }) =>
        chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
  }),
] as const

export const headingEditorFeature = defineRichTextEditorFeature(headingFeature, {})
