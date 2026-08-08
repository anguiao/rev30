import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { defineRichTextAction, defineRichTextActionItem } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { historyFeature } from '../core/feature'

export const historyActions = [
  defineRichTextAction(historyFeature, {
    key: 'undo',
    command: ({ chain }) => chain().focus().undo().run(),
  }),
  defineRichTextAction(historyFeature, {
    key: 'redo',
    command: ({ chain }) => chain().focus().redo().run(),
  }),
] as const

export const historyActionItems = [
  defineRichTextActionItem(historyActions[0], {
    label: '撤销',
    icon: 'i-[lucide--undo-2]',
  }),
  defineRichTextActionItem(historyActions[1], {
    label: '重做',
    icon: 'i-[lucide--redo-2]',
  }),
] as const

export const historyEditorFeature = defineRichTextEditorFeature(historyFeature, {
  extensions: () => [UndoRedo],
})
