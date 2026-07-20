import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { historyFeature } from './shared'

export const historyActions = [
  defineRichTextAction(historyFeature, {
    key: 'undo',
    command:
      () =>
      ({ chain }) =>
        chain().focus().undo().run(),
  }),
  defineRichTextAction(historyFeature, {
    key: 'redo',
    command:
      () =>
      ({ chain }) =>
        chain().focus().redo().run(),
  }),
] as const

export const historyEditorFeature = defineRichTextEditorFeature(historyFeature, {
  extensions: () => [UndoRedo],
})
